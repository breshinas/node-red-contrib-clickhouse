module.exports = function (RED) {
  const { createClient } = require('@clickhouse/client');

  function randStr() {
    return Math.floor(Math.random() * Date.now()).toString(36);
  }

  function isJsonObject(obj) {
    return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
  }

  function isString(value) {
    return typeof value === 'string' && value.length > 0;
  }

  function ClientNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // prepare clickhouse connection uri
    let clickhouseUri = '';
    switch (config.uriTabActive) {
      case 'tab-uri-simple':
        if (config.protocol && config.hostname) {
          clickhouseUri = `${config.protocol}://${config.hostname}`;
        } else {
          throw new Error('Clickhouse protocol or hostname undefined.');
        }
        if (config.port) {
          clickhouseUri += `:${config.port}`;
        }
        break;
      case 'tab-uri-advanced':
        if (config.uri) {
          clickhouseUri = config.uri;
        } else {
          throw new Error('Clickhouse URI undefined.');
        }
        break;
      default:
        throw new Error('Clickhouse uri config failed.');
    }

    // app name will be printed in db server log upon establishing each connection
    const appName = config.appName || `nodered-${randStr()}`;

    // init clickhouse client instance
    node.clickhouseClient = createClient({
      url: clickhouseUri, // e.g., 'http://localhost:8123'
      pathname: config.pathname || '',
      username: process.env["CLICKHOUSE_USER"] || node.credentials.username || '',
      password: process.env["CLICKHOUSE_PASSWORD"] || node.credentials.password || '',
      database: config.dbName,
      application: appName,
      max_open_connections: parseInt(config.maxPoolSize || '100', 10),
      // Assuming some queries may exceed 5 minutes execution time
      request_timeout: 400_000,
      keep_alive: {
        enabled: true,
        idle_socket_ttl: parseInt(config.maxIdleTimeMS || '2500', 10), // idle socket time in ms
      },
      // from https://clickhouse.com/docs/integrations/javascript#keep-alive-troubleshooting
      clickhouse_settings: {
        send_progress_in_http_headers: 1,
        http_headers_progress_interval_ms: '110000', // UInt64, passed as a string
      },
    });

    // on flow redeployment or node-red instance shutdown
    node.on('close', async (removed, done) => {
      done = done || function () { };
      if (node.clickhouseClient) {
        // close clickhouse client and all open connections
        await node.clickhouseClient.close();
        node.log('client closed');
      }
      done();
    });

    node.log(`client initialized with app name '${appName}'`);
    //node.log(`node.clickhouseClient '${JSON.stringify(node.clickhouseClient)}'`);
  }

  RED.nodes.registerType('clickhouse-client', ClientNode, {
    credentials: {
      username: { type: 'text' },
      password: { type: 'password' },
    },
  });

  function OperationNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.client = RED.nodes.getNode(config.clientNode);
	
    if (!node.client) {
      node.client = {
        clickhouseClient: createClient({
          url: process.env["CLICKHOUSE_URI"] || "http://clickhouse:8123",
          pathname: process.env["CLICKHOUSE_PATHNAME"] || "",
          username: process.env["CLICKHOUSE_USER"] || "admin",
          password: process.env["CLICKHOUSE_PASSWORD"] || "pass",
          database: process.env["CLICKHOUSE_DB"] || "default",
          application: process.env["APP_NAME"] || "Node-RED",
          max_open_connections: parseInt(process.env["CLICKHOUSE_POOL_SIZE"] || "100", 10),
          request_timeout: 400_000,
          keep_alive: {
            enabled: true,
            idle_socket_ttl: parseInt(process.env["CLICKHOUSE_MAX_IDLE_MS"] || "2500", 10),
          },
          clickhouse_settings: {
            send_progress_in_http_headers: 1,
            http_headers_progress_interval_ms: '110000',
          },
        }),
      };

      // ensure cleanup on redeploy or shutdown
      node.on('close', async (removed, done) => {
        done = done || function () {};
        if (node.client?.clickhouseClient) {
          await node.client.clickhouseClient.close();
          node.log("Env-based ClickHouse client closed");
        }
        done();
      });
    }


    node.config = {
      mode: config.mode, // "query" || "insert"
      table: config.table,
      query: config.query,
      output: config.output,
      //format: config.format || 'JSONEachRow',
      wait: config.wait,
      // maxTimeMS: parseInt(config.maxTimeMS || "0", 10),
      returnError: config.returnError,
    };

    // display node metric in node status
    const metric = {
      execCtr: 0,
      successCtr: 0,
      errorCtr: 0,
      runtime: 0,
    };

    // Do not update status faster than x ms
    const updateStatusPeriodMs = 1000;
    let statusTimer = null;

    function updateStatus({ fill }) {
      if (!statusTimer) {
        statusTimer = setTimeout(() => {
          node.status({
            fill: fill,
            shape: 'dot',
            text: `s=${metric.successCtr}, err=${metric.errorCtr}, rt=${metric.runtime}ms`,
          });
          statusTimer = null;
        }, updateStatusPeriodMs);
      }
    }

    // init
    updateStatus({ fill: 'green' });

    function execStart() {
      const execStartTs = Date.now();
      metric.execCtr++;
      updateStatus({ fill: 'blue' });
      return execStartTs;
    }

    function execSuccess(execStartTs) {
      metric.execCtr--;
      metric.successCtr++;
      metric.runtime = Date.now() - execStartTs;
      updateStatus({
        fill: metric.execCtr > 0 ? 'blue' : 'green',
      });
    }

    function execError(execStartTs) {
      metric.execCtr--;
      metric.errorCtr++;
      metric.runtime = Date.now() - execStartTs;
      updateStatus({
        fill: 'red',
      });
    }

    node.on('input', async (msg, send, done) => {
      done = done || function () { };

      const execStartTs = execStart();

      try {
        // ============================================================

        /* // ==== we can stream result
        const rows = await client.query({
          query: 'SELECT number FROM system.numbers_mt LIMIT 5',
          format: 'JSONEachRow', // or JSONCompactEachRow, JSONStringsEachRow, etc.
        })
        const stream = rows.stream()
        stream.on('data', (rows: Row[]) => {
          rows.forEach((row: Row) => {
          console.log(row.json()) // or `row.text` to avoid parsing JSON
          })
        })
        await new Promise((resolve, reject) => {
          stream.on('end', () => {
          console.log('Completed!')
          resolve(0)
          })
          stream.on('error', reject)
        })
        */

        /* // ==== we can output result as CSV
        const resultSet = await client.query({
          query: 'SELECT number FROM system.numbers_mt LIMIT 5',
          format: 'CSV', // or TabSeparated, CustomSeparated, etc.
        })
        const stream = resultSet.stream()
        stream.on('data', (rows: Row[]) => {
          rows.forEach((row: Row) => {
          console.log(row.text)
          })
        })
        await new Promise((resolve, reject) => {
          stream.on('end', () => {
          console.log('Completed!')
          resolve(0)
          })
          stream.on('error', reject)
        })
        */

        /* // ==== we can stream results
        const resultSet = await client.query({
          query: 'SELECT number FROM system.numbers LIMIT 10',
          format: 'JSONEachRow', // or JSONCompactEachRow, JSONStringsEachRow, etc.
        })
        for await (const rows of resultSet.stream()) {
          rows.forEach(row => {
          console.log(row.json())
          })
        }
        */

        // ============================================================

        // Check for valid client
        if (!node.client) {
          throw new Error('Clickhouse config error.');
        }

        let result;
        let clickhouse_settings = {};
        if (config.wait) clickhouse_settings.wait_end_of_query = 1;
		const mode = msg.mode || node.config.mode;

        switch (mode) {
          case 'insert':
            {
              const tableName = node.config.table || msg.table;
              if (!isString(tableName)) throw new Error('table name undefined');

              // Prepare operation arguments
              let values = [];
              if (msg.payload) {
                if (Array.isArray(msg.payload)) {
                  values = msg.payload;
                } else {
                  values = [msg.payload];
                }
              }
              if (values.length === 0)
                throw new Error(
                  'msg.payload does not contain any item for insert mode. table: ' +
                  tableName
                );

              let cmd = {
                table: tableName,
                format: 'JSONEachRow',
                values: values,
                clickhouse_settings: clickhouse_settings,
              };
              result = await node.client.clickhouseClient.insert(cmd);

              msg.payload = result.summary;
              send(msg);
            }
            break;

          case 'command':
          case 'query':
          default: {
            const query = node.config.query || msg.query;
            if (!isString(query)) throw new Error('query undefined');

            // Use msg.params or, if msg.payload is a JSON object, use it as parameters
            let params =
              msg.params || (isJsonObject(msg.payload) ? msg.payload : {});

            let cmd = {
              query: query,
              query_params: params,
              //format: 'JSONEachRow',
              clickhouse_settings: clickhouse_settings,
            };

            if (mode == 'command') {
              result = await node.client.clickhouseClient.command(cmd);
              send({ ...msg, payload: result });
            } else {
              cmd.format = msg.format || 'JSONEachRow';
              result = await node.client.clickhouseClient.query(cmd);

              // Handle output processing based on configuration
              switch (node.config.output) {
                case 'forEach': {
                  const stream = result.stream();
                  await new Promise((resolve, reject) => {
                    stream.once('end', resolve);
                    stream.once('error', reject);
                    stream.on('data', (rows) => {
                      rows.forEach((row) => {
                        let json = row.json();
                        //node.log(`row json= '${json}'`);
                        send({ ...msg, payload: json });
                      });
                    });
                  });
                  // send an empty array to indicate completion
                  send({ ...msg, payload: null });
                  break;
                }
                case 'toArray':
                default:
                  send({ ...msg, payload: await result.json() });
              }
            }
          }
        }

        execSuccess(execStartTs);
        done();
      } catch (err) {
        execError(execStartTs);
		if (config.returnError) {
			send({ ...msg, error: err });
			done();
		} else {
			done(err);
		}
      }
    });

    node.on('close', async (removed, done) => {
      done = done || function () { };
      // do some removal job ...
      done();
    });
  }

  RED.nodes.registerType('clickhouse', OperationNode);
};

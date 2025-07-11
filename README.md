# node-red-contrib-clickhouse

A Clickhouse driver node for Node-Red.

[![npm version](https://img.shields.io/npm/v/node-red-contrib-clickhouse.svg?style=flat-square)](https://www.npmjs.org/package/node-red-contrib-clickhouse)
[![install size](https://img.shields.io/badge/dynamic/json?url=https://packagephobia.com/v2/api.json?p=node-red-contrib-clickhouse&query=$.install.pretty&label=install%20size&style=flat-square)](https://packagephobia.now.sh/result?p=node-red-contrib-clickhouse)
[![npm downloads](https://img.shields.io/npm/dm/node-red-contrib-clickhouse.svg?style=flat-square)](https://npm-stat.com/charts.html?package=node-red-contrib-clickhouse)

This package includes two nodes for node-red:

**The Config Node**

Connect to your local Clickhouse Server or a Cloud versions.
![client-node](https://raw.githubusercontent.com/breshinas/node-red-contrib-clickhouse/refs/heads/master/examples/config-node.png)

**The Flow Node**

Execute an query/insert/command within your flow.
![flow-node](https://raw.githubusercontent.com/breshinas/node-red-contrib-clickhouse/refs/heads/master/examples/operation-node.png)

_This node was inspired by other projects like [node-red-contrib-mongodb4](https://github.com/steineey/node-red-contrib-mongodb4)

## Installation

Navigate to your .node-red directory - typically `~/.node-red`.

```sh
npm install --save --omit=dev node-red-contrib-clickhouse
```

## Compatibility

The latest version of node-red-contrib-clickhouse@1.0.x is tested with the following Clickhouse server versions: 25.3.1

Node-RED >= v3.0.0  
NodeJS >= v16.20.1


## Usage Example

Import the example flow to get a quick introduction how to use this node. \
[flow.json](https://raw.githubusercontent.com/breshinas/node-red-contrib-clickhouse/refs/heads/master/examples/example-1.json) \
\
![flow-image](https://raw.githubusercontent.com/breshinas/node-red-contrib-clickhouse/refs/heads/master/examples/example-1-flow.png)

## The Configuration Node

### Simple Connection URI

-   **Protocol** - `http` or `https`

-   **Hostname** - Hostname / IP to connect to Clickhouse

-   **Port** - Optional port number. In most cases `8123`.

-   **Pathname** - Custom path name to add to URI. [Details](https://clickhouse.com/docs/integrations/javascript#proxy-with-a-pathname)

Note: you can set all values in config node to environment variable using form `${CLICKHOUSE_HOST}`. Nodered will convert that to your actual setting on startup.

### Advanced Connection URI

-   **URI** - Define your own connection string in URI format.

### Authentication (optional)

-   **Username** - Username for authentication. Also you can define username as environment `CLICKHOUSE_USER` (it override username value)

-   **Password** - Password for authentication. Also you can define password as environment `CLICKHOUSE_PASSWORD` (it override password value)

### Application

-   **Database** - A Clickhouse database name is required.

-   **Application Name** - The name of the application that created this ClickHouse instance.

If this field is unspecified, the client node will create a app name for you.
That looks like this: `nodered-azmr5z97`. The prefix `nodered` is static. `azmr5z97` is a random connection pool id, created on runtime start-up, config-node update and full deployment.

The current app name of a config node is logged to the node-red runtime log.


### Connect Options

-   **MaxPoolsize** - Specifies the maximum number of connections the driver should create in its connection pool. This count includes connections in use.

-   **MaxIdleTimeMS** - Specifies the amount of time, in milliseconds, a connection can be idle before it's closed. Specifying 0 means no minimum.

### Connection Pools

Each configuration node has his own connection pool with a default max poolsize of 100 connection at a given time. 

## The Flow Node

Execute clickhouse operations with this node.

### Inputs / Options

-   **Connection (clickhouse-client)** - Select a Clickhouse server connection.

-   **Mode | msg.mode (string)** - Decide which operation do you want to use {'query', 'command', 'insert'}

-   **Table | msg.table (string)** - table name for insert operation.

-   **Output | msg.output (string)** - Define output processing for 'query' mode {'toArray', 'forEach'}.  
'forEach' produce output for each received record in stream manner and additional msg with an payload equal to null.

-   **Format | msg.format (string)** - format output. By default assigned 'JSONEachRow' value but you can define your own if needed.

-   **msg.payload (array | JSON )** - Pass message payload as array for 'insert' mode. For 'query' mode it should be JSON object.

-   **Wait for completion** - With this feature enabled, the operation node will wait until execution were complete. See [wait_end_of_query](https://clickhouse.com/docs/operations/settings/settings#http_wait_end_of_query)

-   **Do not throw error (place it into msg)** - With this feature enabled, the operation node will return error in msg insted of throwing it

### Payload Output

The node will output the database driver response as message payload.
The mode `query` can output with `toArray` or `forEach`.


### Node Status 

Node status information is displayed below the node:

#### Tags
- **s** : Number of successful executions
- **err** : Number of failed executions 
- **rt** : Last execution runtime in ms 

#### Colors
- **green** : Last execution was successful 
- **blue** : Node execution in progress 
- **red** : Last execution failed

### More general driver information

[Visit the Clickhouse Driver Docs](https://clickhouse.com/docs/integrations/javascript)

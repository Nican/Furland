import React, { Component } from 'react';
import Graph from 'graphology';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import GUI from 'lil-gui';
import { encode, decode } from "@msgpack/msgpack";

let screenSize = 3200;
let nodeRadius = 16;

var btn = document.querySelector('button');
var svg = document.querySelector('svg');
var canvas = document.querySelector('canvas');

function triggerDownload (imgURI) {
  var evt = new MouseEvent('click', {
    view: window,
    bubbles: false,
    cancelable: true
  });

  var a = document.createElement('a');
  a.setAttribute('download', 'MY_COOL_IMAGE.png');
  a.setAttribute('href', imgURI);
  a.setAttribute('target', '_blank');

  a.dispatchEvent(evt);
}
export default class TwitterGraph extends Component {
    constructor(props) {
        super(props);

        this.mouseEnter = this.mouseEnter.bind(this);
        this.onMouseClick = this.onMouseClick.bind(this);
        this.saveAsPng = this.saveAsPng.bind(this);
        this.state = {};
        this.nodeRefs = {};
        this.gui = new GUI();
        this.config = {
            barnesHutOptimize: true,
            strongGravityMode: true,
            weighted: false,
            gravity: 0.1,
            slowDown: 100,
            scalingRatio: 10,
            edgeWeightInfluence: 1,
            linLogMode: false,
            reset: () => this.reset(),
        };

        this.edgeConfig = {
            option: 'TopN',
            topN: 10
        };

        this.gui.add(this.config, 'barnesHutOptimize');
        this.gui.add(this.config, 'strongGravityMode');
        this.gui.add(this.config, 'weighted');
        this.gui.add(this.config, 'linLogMode');
        this.gui.add(this.config, 'gravity', 0, 2);
        this.gui.add(this.config, 'slowDown', 0, 200);
        this.gui.add(this.config, 'scalingRatio', 0, 30);
        this.gui.add(this.config, 'edgeWeightInfluence', 0, 10);
        this.gui.add(this.config, 'reset');

        const edgeFolder = this.gui.addFolder('Edges');
        edgeFolder.add(this.edgeConfig, 'option', ['Basic', 'TopN']);
        edgeFolder.add(this.edgeConfig, 'topN', 0, 50);


        this.gui.onChange(event => {
            console.log(event);
            if (event.object === this.config) {
                this.setupForceAtlas()
            } else if (event.object === this.edgeConfig) {
                this.setupEdges();
            }
        });
    }

    onMouseClick(idx) {
        this.setState({ selectedNode: idx });
    }

    mouseEnter(idx) {
        // this.setState({ hover: idx });
    }

    componentWillUnmount() {
        cancelAnimationFrame(this.anim);
        this.gui.destroy();
    }

    reset() {
        if (this.graph && this.layout) {
            this.graph.updateEachNodeAttributes(
                function (node, attr) {
                    attr.x = (Math.random() - 0.5) * screenSize;
                    attr.y = (Math.random() - 0.5) * screenSize;
                    return attr;
                },
                { attributes: ['x', 'y'] }
            );

            this.setupForceAtlas();
        }
    }

    async componentDidMount() {
        const [response, response3] = await Promise.all([
            fetch(`/api/graph/user/${this.props.screenName}/matrix`),
            fetch("/api/graph/friendmatrix"),
        ]);

        const data = decode(await response.arrayBuffer());
        this.data = data.mutualMatrix;
        this.followerData = data.friends;
        this.followerMatrix = await response3.json();
        const nodeCount = Math.sqrt(this.data.length);

        this.graph = new Graph();
        this.nodeCount = nodeCount;

        const nodes = [];

        this.followerData.forEach((item, idx) => {
            const node = this.graph.addNode(idx, {
                x: (Math.random() - 0.5) * screenSize,
                y: (Math.random() - 0.5) * screenSize
            });
            nodes.push(node);

            this.nodeRefs[idx.toString()] = React.createRef();
        });
        this.reset();

        this.setupEdges();
        this.setupForceAtlas();
        this.anim = requestAnimationFrame(() => this.runKernel());
        this.forceUpdate();
    }

    setupEdges() {
        this.layout?.kill();

        this.graph.clearEdges();
        const nodeCount = this.nodeCount;
        const followerMatrix = this.followerMatrix;
        const followerData = this.followerData;
        const data = this.data;

        if (this.edgeConfig.option === 'Basic') {
            for (var x = 0; x < nodeCount; x++) {
                for (var y = 0; y < nodeCount; y++) {
                    if (x === y) {
                        continue;
                    }

                    const mutualCount = data[x * nodeCount + y];
                    const oppositeCount = data[y * nodeCount + x];

                    const edge_threshold = Math.min(3, mutualCount / 10)

                    if (mutualCount <= edge_threshold) {
                        // if (mutualCount == 0 || oppositeCount == 0) {
                        continue;
                    }

                    this.graph.mergeEdge(x.toString(), y.toString(), {
                        // weight: 1,
                        weight: Math.pow(mutualCount, 1.5)
                        // weight: Math.sqrt(mutualCount) / 10,
                    });
                }
            }
        }

        if (this.edgeConfig.option === 'TopN') {
            for (let x = 0; x < nodeCount; x++) {
                const slice = data.slice(x * nodeCount, x * nodeCount + nodeCount);
                const map = slice
                    .map((value, idx) => [value, idx])
                    .filter(t => {
                        return t[1] !== x && (t[0] > 0) && (data[t[1] * nodeCount + x] > t[0] * 0.25); // && ((data[t[1] * nodeCount + x] > t[0] * 0.25) || t[0] < 10)
                    })
                    .sort((a, b) => {
                        const followA = followerMatrix[a[1] * nodeCount + b[1]];
                        const followB = followerMatrix[b[1] * nodeCount + a[1]];
                        const profileA = followerData[a[1]];
                        const profileB = followerData[b[1]];

                        //if (followB == followA) {
                        return (b[0] - a[0]) / profileB.friendsCount;
                        //}

                        //return followB - followA;
                    });

                map.slice(0, this.edgeConfig.topN).forEach(item => {
                    this.graph.mergeEdge(x.toString(), item[1].toString(), {
                        weight: Math.log(item[0]), //item[0],
                    });
                });
            }
        }

        this.setupForceAtlas();
    }

    setupForceAtlas() {
        if (this.layout) {
            this.layout.kill();
        }

        if (!this.graph) {
            return;
        }

        this.layout = new FA2Layout(this.graph, {
            settings: {
                gravity: this.config.gravity,
                edgeWeightInfluence: this.config.edgeWeightInfluence,
                weight: 'weight',
                weighted: this.config.weighted,
                barnesHutOptimize: this.config.barnesHutOptimize,
                strongGravityMode: this.config.strongGravityMode,
                scalingRatio: this.config.scalingRatio,
                slowDown: this.config.slowDown,
                linLogMode: this.config.linLogMode,
            },
            weighted: this.config.weighted,
        });

        // To start the layout
        this.layout.start();
    }

    runKernel() {
        // this.kernelOutput = this.positionKernel(this.kernelOutput, this.data);
        // this.forceUpdate();
        this.anim = requestAnimationFrame(() => this.runKernel());

        this.graph.nodes().map((item, idx) => {
            const attr = this.graph.getNodeAttributes(item);
            const ref = this.nodeRefs[idx.toString()].current;
            const x = Math.floor(attr.x + screenSize / 2);
            const y = Math.floor(attr.y + screenSize / 2);

            if (ref.cx != x || ref.cy != y) {
                ref.setAttribute('cx', attr.x + screenSize / 2);
                ref.setAttribute('cy', attr.y + screenSize / 2);
            }
        });
    }

    saveAsPng() {
        var canvas = document.getElementById('canvas');
        var ctx = canvas.getContext('2d');
        var data = (new XMLSerializer()).serializeToString(document.querySelector('svg'));
        var DOMURL = window.URL || window.webkitURL || window;
        console.log(data);
      
        var img = new Image();
        var svgBlob = new Blob([data], {type: 'image/svg+xml;charset=utf-8'});
        var url = DOMURL.createObjectURL(svgBlob);
      
        img.onload = function () {
          ctx.drawImage(img, 0, 0);
          DOMURL.revokeObjectURL(url);
      
          var imgURI = canvas
              .toDataURL('image/png')
              .replace('image/png', 'image/octet-stream');
      
          triggerDownload(imgURI);
        };
      
        img.src = url;
    }

    render() {
        if (!this.graph) {
            return <div />;
        }

        return <>
            <div style={{ position: 'absolute', left: '0px', width: '200px', top: '0px', bottom: '0px', overflow: 'auto' }}>
                <button onClick={this.saveAsPng}>Save as PNG</button>
                {this.state.selectedNode && (<UserNodeDetails
                    selected={this.state.selectedNode}
                    followerData={this.followerData}
                    slice={this.data.slice(this.state.selectedNode * this.nodeCount, this.state.selectedNode * this.nodeCount + this.nodeCount)}
                />)}
            </div>
            <div style={{ position: 'absolute', left: '200px', right: '0px', top: '0px', bottom: '0px', overflow: 'scroll' }}>
                <svg viewBox={`0 0 ${screenSize} ${screenSize}`} xmlns="http://www.w3.org/2000/svg" style={{ width: `${screenSize}px` }}>
                    <defs>
                        {
                            this.followerData.map((item, idx) => {
                                if (item == null) {
                                    return undefined;
                                }

                                return <pattern key={idx} id={`profileImage${idx}`} x="0%" y="0%" height="100%" width="100%"
                                    viewBox="0 0 48 48">
                                    <image x="0%" y="0%" width="48" height="48" xlinkHref={`/api/twitter/${item.id}/picture`}></image>
                                </pattern>;
                            })
                        }
                    </defs>
                    {
                        this.state.hover && this.graph.nodes().map((item, idx) => {
                            const pt1 = this.graph.getNodeAttributes(this.state.hover);
                            const pt2 = this.graph.getNodeAttributes(item);

                            const mutuals = this.data[this.state.hover * this.nodeCount + idx];

                            if (mutuals < 10) {
                                return undefined;
                            }

                            return <line
                                key={idx}
                                x1={pt1.x + screenSize / 2}
                                y1={pt1.y + screenSize / 2}
                                x2={pt2.x + screenSize / 2}
                                y2={pt2.y + screenSize / 2}
                                stroke="black"
                                strokeWidth={Math.min(mutuals / 4, 30)}
                            />;
                        })
                    }
                    {
                        this.graph.nodes().map((item, idx) => {
                            const attr = this.graph.getNodeAttributes(item);

                            const user = this.followerData[idx];

                            return <UserNode
                                screenName={user?.screenName}
                                nodeRef={this.nodeRefs[idx.toString()]}
                                idx={idx}
                                key={idx}
                                nodeRadius={nodeRadius}
                                mouseEnter={this.mouseEnter}
                                onMouseClick={this.onMouseClick}
                            />;
                        })
                    }
                </svg>
            </div>
        </>;
    }
}

class UserNodeDetails extends Component {


    render() {
        const user = this.props.followerData[this.props.selected];
        const sliceMap = this.props.slice.map((value, idx) => {
            return [value, idx];
        }).sort((a, b) => b[0] - a[0]);

        return <div>
            <div>{user?.screenName} ({user?.id})</div>
            {
                sliceMap.map(idx => {
                    const t = this.props.followerData[idx[1]];
                    if (!t) {
                        return undefined;
                    }

                    return <div>{t.screenName} {idx[0]}</div>
                })
            }


        </div>;

    }

}

class UserNode extends Component {
    constructor(props) {
        super(props);

        this.onMouseClick = this.onMouseClick.bind(this);
        this.onMouseEnter = this.onMouseEnter.bind(this);
        this.onMouseLeave = this.onMouseLeave.bind(this);
    }

    onMouseEnter() {
        console.log('Enter: ', this.props.screenName);
        this.props.mouseEnter(this.props.idx);
    }

    onMouseLeave() {
        console.log('Leave: ', this.props.screenName);
        this.props.mouseEnter(null);
    }

    onMouseClick() {
        this.props.onMouseClick(this.props.idx);
    }

    render() {
        const { screenName, idx, nodeRadius } = this.props;

        return <circle
            onClick={this.onMouseClick}
            onMouseOver={this.onMouseEnter}
            onMouseLeave={this.onMouseLeave}
            fill={`url(#profileImage${idx})`}
            ref={this.props.nodeRef}
            r={nodeRadius}
        />
    }
}
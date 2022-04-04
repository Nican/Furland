import React, { Component } from 'react';
import Graph from 'graphology';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import { encode, decode } from "@msgpack/msgpack";
import { MovableCanvas, Transform } from '../MovableCanvas';

import GUI from 'lil-gui';
import { InputData, TwitterData, TwitterUserData } from './Data';

let screenSize = 12000;
let nodeRadius = 16;

function updateNode(node: any) {
    const attr = node.attributes;
    const ref = attr.ref.current;
    if (ref) {
        ref.setAttribute('cx', attr.x);
        ref.setAttribute('cy', attr.y);
    }
}

interface Config {
    adjustSizes: boolean;
    barnesHutOptimize: boolean;
    strongGravityMode: boolean;
    weighted: boolean;
    gravity: number;
    slowDown: number;
    scalingRatio: number;
    edgeWeightInfluence: number;
    linLogMode: boolean;
    reset(): void;
}

interface EdgeConfig {
    option: string;
    topN: number;
    mutualsOnly: boolean;
}

interface TwitterGraphProps {
    screenName: string;
}

interface TwitterGraphState {
    selectedNode?: number;
    hover?: number;
}

export class TwitterGraph extends Component<TwitterGraphProps, TwitterGraphState> {
    private gui: GUI;
    private config: Config;
    private edgeConfig: EdgeConfig;
    private layout?: FA2Layout;
    private graph: Graph;
    private data?: TwitterData;
    private edgeRef: React.RefObject<SVGGElement>;

    constructor(props: any) {
        super(props);

        this.mouseEnter = this.mouseEnter.bind(this);
        this.onMouseClick = this.onMouseClick.bind(this);
        this.edgeRef = React.createRef();

        this.state = {
            selectedNode: undefined,
        };

        this.graph = new Graph();
        this.gui = new GUI();
        this.config = {
            adjustSizes: true,
            barnesHutOptimize: false,
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
            topN: 20,
            mutualsOnly: true,
        };

        this.gui.add(this.config, 'adjustSizes');
        this.gui.add(this.config, 'strongGravityMode');
        this.gui.add(this.config, 'weighted');
        this.gui.add(this.config, 'linLogMode');
        this.gui.add(this.config, 'gravity', 0, 2);
        this.gui.add(this.config, 'slowDown', 0, 200);
        this.gui.add(this.config, 'scalingRatio', 0, 30);
        this.gui.add(this.config, 'edgeWeightInfluence', 0, 2);
        this.gui.add(this.config, 'reset');

        const edgeFolder = this.gui.addFolder('Edges');
        edgeFolder.add(this.edgeConfig, 'option', ['Basic', 'TopN']);
        edgeFolder.add(this.edgeConfig, 'topN', 0, 100);
        edgeFolder.add(this.edgeConfig, 'mutualsOnly');


        this.gui.onChange(event => {
            if (event.object === this.config) {
                this.setupForceAtlas()
            } else if (event.object === this.edgeConfig) {
                this.setupEdges();
            }
        });
    }

    onMouseClick(idx: number) {
        this.setState({ selectedNode: idx });
    }

    mouseEnter(idx: number) {
        // Old node
        if (this.state.hover) {
            const oldEdgeElemenets = this.graph.getNodeAttribute(this.state.hover, 'edgeElements');

            if (oldEdgeElemenets) {
                for (const elem of oldEdgeElemenets) {
                    elem.parentNode.removeChild(elem);
                }
            }

            this.graph.setNodeAttribute(this.state.hover, 'edgeElements', undefined);
        }


        this.setState({ hover: idx });

        const edgeRef = this.edgeRef.current;
        if (idx && edgeRef) {
            const lines: any[] = [];

            this.graph.forEachNeighbor(idx, (neighbor, attr) => {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'polygon') as SVGPolygonElement;
                // line.setAttribute('stroke', 'white');
                // line.setAttribute('strokeWidth', '0');
                line.setAttribute('graph-id', neighbor);

                lines.push(line);
                edgeRef.appendChild(line);
            });

            this.graph.setNodeAttribute(idx, 'edgeElements', lines);
        }
    }

    componentWillUnmount() {
        this.layout?.kill();
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
        const [response] = await Promise.all([
            fetch(`/api/graph/user/${this.props.screenName}/matrix`),
        ]);

        const data = decode(await response.arrayBuffer()) as InputData;
        this.data = new TwitterData(data);

        this.graph.on('eachNodeAttributesUpdated', () => {
            /*
            for (let [_, node] of this.graph._nodes) {
                const attr = node.attributes;
                const ref = attr.ref.current;
                if (ref) {
                    ref.setAttribute('cx', attr.x);
                    ref.setAttribute('cy', attr.y);
                }
            }
            */

            // this.graph._nodes.forEach(updateNode);

            this.graph.forEachNode((_idx, attr) => {
                const ref = attr.ref.current;
                if (ref) {
                    ref.setAttribute('cx', attr.x);
                    ref.setAttribute('cy', attr.y);
                }
            });

            if (this.state.hover && this.edgeRef.current) {
                const x = this.graph.getNodeAttribute(this.state.hover, 'x');
                const y = this.graph.getNodeAttribute(this.state.hover, 'y');
                const edgeElements = this.graph.getNodeAttribute(this.state.hover, 'edgeElements') as SVGPolygonElement[];

                if (edgeElements) {
                    const count = edgeElements.length;
                    let id = 0;
                    for (const elem of edgeElements) {
                        const graphId = elem.getAttribute('graph-id');
                        if (graphId) {
                            const other = this.graph.getNodeAttributes(graphId);

                            elem.setAttribute('points', `${x + 10},${y} ${other.x},${other.y} ${x - 10},${y}`);
                            elem.setAttribute('fill', `rgba(255,255,255,${id / count})`);
                            id++;

                            // elem.setAttribute('x1', x);
                            // elem.setAttribute('y1', y);
                            // elem.setAttribute('x2', other.x);
                            // elem.setAttribute('y2', other.y);
                        }
                    }
                }
            }
        });

        const nodes = [];

        this.data.followerData.forEach((item, idx) => {
            const ref = React.createRef();
            const size = Math.sqrt(Math.min(item.friendsCount, 10000)) / Math.sqrt(10000) * nodeRadius * 2 + nodeRadius;
            const node = this.graph.addNode(idx, {
                id: idx,
                size,
                x: (Math.random() - 0.5) * screenSize,
                y: (Math.random() - 0.5) * screenSize,
                ref,
            });
            nodes.push(node);
        });
        this.reset();

        this.setupEdges();
        this.setupForceAtlas();
        this.forceUpdate();
    }

    setupEdges() {
        this.layout?.kill();

        this.graph.clearEdges();
        const data = this.data!;
        const edgeConfig = this.edgeConfig;
        const nodeCount = data.nodeCount;
        const followerData = data.followerData;

        if (this.edgeConfig.option === 'Basic') {
            for (var x = 0; x < nodeCount; x++) {
                for (var y = 0; y < nodeCount; y++) {
                    if (x === y) {
                        continue;
                    }

                    const mutualCount = data.friendCount(x, y);

                    if (mutualCount === 0) {
                        continue;
                    }

                    if (edgeConfig.mutualsOnly && !data.isMutual(x, y)) {
                        continue;
                    }

                    /*
                    const edge_threshold = Math.min(3, mutualCount / 10)

                    if (mutualCount <= edge_threshold) {
                        // if (mutualCount == 0 || oppositeCount == 0) {
                        continue;
                    }
                    */

                    this.graph.mergeEdge(x.toString(), y.toString(), {
                        // weight: 1,
                        weight: Math.sqrt(mutualCount)
                        // weight: Math.sqrt(mutualCount) / 10,
                    });
                }
            }
        }

        if (this.edgeConfig.option === 'TopN') {
            const topN = this.edgeConfig.topN;

            const items = data.followerData
                .map((value, index) => ({value, index}))
                .sort((a,b) => b.value.friendsCount - a.value.friendsCount);

            // for (let x = 0; x < nodeCount; x++) {
            for(const item of items) {
                const x = item.index;
                const slice = data.friendSlice(x);
                const map = slice
                    .map((value, idx) => [value, idx])
                    .filter(t => {
                        if (t[0] <= 0) {
                            return false;
                        }

                        if (edgeConfig.mutualsOnly && !data.isMutual(x, t[1])) {
                            return false;
                        }

                        if (this.graph.degree(t[1]) > topN) {
                            return false;
                        }

                        return true;
                    })
                    .sort((a, b) => {
                        const profileA = followerData[a[1]];
                        const profileB = followerData[b[1]];

                        //if (followB == followA) {
                        // return (b[0] - a[0]) / profileB.friendsCount;
                        //}

                        //return followB - followA;
                        return b[0] - a[0];
                    });

                map.forEach(item => {
                    if (this.graph.degree(x.toString()) < topN) {
                        this.graph.mergeEdge(x.toString(), item[1].toString(), {
                            weight: Math.sqrt(item[0]),
                        });
                    }
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
            } as any,
            weighted: this.config.weighted,
        });

        // To start the layout
        this.layout.start();
    }

    render() {
        if (!this.graph || !this.data) {
            return <div />;
        }

        const cx = screenSize / 2;
        const cy = screenSize / 2;

        const data = this.data;
        const followerData = data.followerData;

        // <button onClick={this.saveAsPng}>Save as PNG</button>
        return <>
            <div style={{ position: 'absolute', left: '0px', width: '200px', top: '0px', bottom: '0px', overflow: 'auto' }}>
                {this.state.selectedNode && (<UserNodeDetails
                    selected={this.state.selectedNode}
                    followerData={followerData}
                    slice={data.friendSlice(this.state.selectedNode)}
                    data={data}
                    mutualOnly={this.edgeConfig.mutualsOnly}
                />)}
            </div>
            <div style={{ position: 'absolute', left: '200px', right: '0px', top: '0px', bottom: '0px', overflow: 'hidden' }}>
                <MovableCanvas width={screenSize} height={screenSize}>
                    <svg style={{ height: "100%", width: "100%" }}>
                        <SVGProfilePics followerData={followerData} />
                        <g transform={`translate(${cx}, ${cy})`}>
                            <g ref={this.edgeRef} />

                            <GraphNodes
                                graph={this.graph}
                                mouseEnter={this.mouseEnter}
                                onMouseClick={this.onMouseClick}
                                followerData={followerData}
                            />
                        </g>
                    </svg>
                </MovableCanvas>
            </div>
        </>;

    }
}

interface GraphNodesProps {
    graph: Graph;
    mouseEnter(name: number | null): void;
    onMouseClick(name: number): void;
    followerData: TwitterUserData[];
}

class GraphNodes extends Component<GraphNodesProps>  {

    shouldComponentUpdate(nextProps: GraphNodesProps) {
        return nextProps.graph !== this.props.graph;
    }

    render() {
        const { graph, mouseEnter, onMouseClick, followerData } = this.props;

        return <>
            {
                graph.mapNodes((item, attr) => {
                    const idx = attr.id;
                    const user = followerData[idx];

                    return <UserNode
                        screenName={user?.screenName}
                        nodeRef={attr.ref}
                        idx={idx}
                        key={idx}
                        nodeRadius={attr.size / 2}
                        mouseEnter={mouseEnter}
                        onMouseClick={onMouseClick}
                    />;
                })
            }
        </>;
    }
}

interface SVGProfilePicsProps {
    followerData: TwitterUserData[];
}

class SVGProfilePics extends Component<SVGProfilePicsProps>  {

    shouldComponentUpdate(nextProps: GraphNodesProps) {
        return nextProps.followerData !== this.props.followerData;
    }

    render() {
        const { followerData } = this.props;

        return <defs>
            {
                followerData.map((item, idx) => {
                    if (item == null) {
                        return undefined;
                    }

                    return <pattern key={idx} id={`profileImage${idx}`} x="0%" y="0%" height="100%" width="100%"
                        viewBox="0 0 48 48">
                        <image x="0%" y="0%" width="48" height="48" xlinkHref={`/api/twitter/${item.id}/picture`}></image>
                    </pattern>;
                })
            }
        </defs>;
    }
}

interface UserNodeDetailsProps {
    selected: number;
    followerData: TwitterUserData[];
    slice: number[];
    data: TwitterData;
    mutualOnly: boolean;
}

class UserNodeDetails extends Component<UserNodeDetailsProps> {
    render() {
        const { selected, followerData, mutualOnly, data } = this.props;

        const user = followerData[selected];
        const sliceMap = this.props.slice
            .map((value: any, idx: any) => { return [value, idx]; })
            .filter(t => {
                if(t[0] === 0 && t[1] === selected){
                    return false;
                }

                if(mutualOnly && !data.isMutual(selected, t[1])) {
                    return false;
                }

                return true;
            })
            .sort((a: any, b: any) => b[0] - a[0]);

        return <div>
            <div style={{ textAlign: 'center' }}>
                <h5>
                    {user?.screenName}
                    <img src={`/api/twitter/${user.id}/picture`} style={{ float: 'left', height: '32px' }} />
                </h5>
            </div>
            {
                sliceMap.slice(0, 100).map((idx: any) => {
                    const t = this.props.followerData[idx[1]];
                    if (!t) {
                        return undefined;
                    }
                    return <div>
                        {t.screenName}
                        <span style={{ float: 'right' }}>
                            {idx[0]}
                        </span>
                        <a href={`https://twitter.com/${t.screenName}`} target='_blank' >
                            <img src={`/api/twitter/${t.id}/picture`} style={{ float: 'left', height: '24px' }} loading="lazy" />
                        </a>
                    </div>
                })
            }
        </div>;
    }
}

interface UserNodeProps {
    idx: number;
    screenName: string;
    nodeRadius: number;
    nodeRef: React.LegacyRef<SVGCircleElement>;
    mouseEnter(name: number | null): void;
    onMouseClick(name: number): void;
}

class UserNode extends Component<UserNodeProps> {
    constructor(props: UserNodeProps) {
        super(props);

        this.onMouseClick = this.onMouseClick.bind(this);
        this.onMouseEnter = this.onMouseEnter.bind(this);
        this.onMouseLeave = this.onMouseLeave.bind(this);
    }

    onMouseEnter() {
        this.props.mouseEnter(this.props.idx);
    }

    onMouseLeave() {
        this.props.mouseEnter(null);
    }

    onMouseClick() {
        this.props.onMouseClick(this.props.idx);
    }

    render() {
        const { idx, nodeRadius } = this.props;

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
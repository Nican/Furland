import React, { Component, MutableRefObject, useEffect, useState } from 'react';
import Graph from 'graphology';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import { MovableCanvas } from '../MovableCanvas';

import { InputData, TwitterData, TwitterUserData } from './Data';
import { Config } from './Config';
import { UserNodeDetails } from './SideBar';
import { button, buttonGroup, useControls } from 'leva';
import { BasicEdges, HeapOrderedEdges, TopNEdges } from './Edge';
import { saveAsPng } from './Png';
import louvain from 'graphology-communities-louvain';

let screenSize = 12000;
let nodeRadius = 16;

interface TwitterGraphProps {
  screenName: string;
  inputData: InputData;
}

interface TwitterGraphState {
  selectedNode?: number;
  hover?: number;
}

interface StatsDetail {
  nodes: number;
  edges: number;
}

export const TwitterGraphWithConfig: React.FC<TwitterGraphProps> = props => {

  const resetRef = React.useRef<() => void>();
  const saveAsPngRef = React.useRef<() => void>();
  const [stats, setStats] = useState<StatsDetail>({ nodes: 0, edges: 0 });
  const [params] = useState(() => new URLSearchParams(window.location.search));

  /*
    preset: {
      value: 1,
      render: () => false,
    },
    presetsBtn: {
      ...buttonGroup({
        label: 'Presets',
        opts: {
          '1': () => set({ 'preset': 1 }),
          '2': () => set({ 'preset': 2 }),
          '3': () => set({ 'preset': 3 }),
        },
      }),
      render: () => false,
    },
  */

  const [{ slowDown, mutualsOnly, topN, maxFriendRank, images, maxFriendRatio, resolution, stroke }, set] = useControls('Graph', (): any => ({
    totalNodes: {
      value: ``,
      editable: false,
    },
    speedBtn: buttonGroup({
      label: 'Speed',
      opts: {
        '0x': () => set({ 'slowDown': -1 }),
        '1x': () => set({ 'slowDown': 100 }),
        '2x': () => set({ 'slowDown': 50 }),
        '4x': () => set({ 'slowDown': 20 }),
        '8x': () => set({ 'slowDown': 5 }),
      },
      render: () => true,
    }),
    slowDown: {
      value: 50,
      min: 0,
      max: 100,
      render: () => false,
    },
    images: props.inputData.friends.length <= 3000, // Disable images by default on graphs > 3k nodes
    stroke: {
      value: true,
      render: (get: any) => get('Graph.images') === true,
    },
    resolution: {
      value: 10,
      min: 1,
      max: 20,
      render: (get: any) => get('Graph.images') === false || get('Graph.stroke') === true,
    },
    mutualsOnly: params.get('mutualsOnly') === 'true',
    topN: {
      value: parseInt(params.get('topN') || '50', 10) || 50,
      min: 1,
      max: 100,
    },
    maxFriendRank: {
      value: parseInt(params.get('maxFriendRank') || '20', 10) || 20,
      min: 1,
      max: 100,
    },
    maxFriendRatio: {
      value: parseInt(params.get('maxFriendRatio') || '0', 10) || 0,
      min: 0,
      max: 99,
    },
    reset: button(() => {
      if (resetRef.current) {
        resetRef.current();
      }
    }),
    save: {
      label: 'Save as PNG',
      ...button(() => {
        if (saveAsPngRef.current) {
          saveAsPngRef.current();
        }
      })
    },
    Twitter: {
      value: `Please tag posts with #bunnypaws`,
      editable: false,
    },
  }));

  useEffect(() => {
    set({ totalNodes: `Nodes: ${stats.nodes}\nEdges: ${stats.edges}` });
  }, [stats.nodes, stats.edges]);

  useEffect(() => {
    const newParams = new URLSearchParams(window.location.search);
    newParams.set('topN', topN);
    newParams.set('maxFriendRank', maxFriendRank);
    newParams.set('mutualsOnly', mutualsOnly);
    newParams.set('maxFriendRatio', maxFriendRatio);

    window.history.pushState(undefined, '', window.location.pathname + '?' + newParams.toString());
  }, [topN, maxFriendRank, mutualsOnly, maxFriendRatio]);

  const config: Config = {
    graph: {
      adjustSizes: true,
      barnesHutOptimize: false,
      strongGravityMode: true,
      gravity: 0.1,
      edgeWeightInfluence: 1,
      scalingRatio: 10,
      weighted: false,
      slowDown,
      linLogMode: false,
      images,
      stroke,
    },
    edge: {
      edgeAlgorithm: 'HeapOrder',
      edgeWeights: 'none',
      mutualsOnly,
      maxFriendRank,
      topN,
      maxFriendRatio,
      resolution,
    },
  };

  return <TwitterGraph {...props} config={config} reset={resetRef} saveAsPng={saveAsPngRef} setStats={setStats} />
};

interface TwitterGraphPropsInner {
  reset: MutableRefObject<(() => void) | undefined>;
  saveAsPng: MutableRefObject<(() => void) | undefined>;
  config: Config;
  screenName: string;
  inputData: InputData;
  setStats(stats: StatsDetail): void;
}

export class TwitterGraph extends Component<TwitterGraphPropsInner, TwitterGraphState> {
  private layout?: FA2Layout;
  private graph: Graph;
  private data: TwitterData;
  private edgeRef: React.RefObject<SVGGElement>;
  private updateId = 0;

  constructor(props: any) {
    super(props);

    this.mouseEnter = this.mouseEnter.bind(this);
    this.onMouseClick = this.onMouseClick.bind(this);
    this.edgeRef = React.createRef();

    this.state = {
      selectedNode: undefined,
    };

    this.data = new TwitterData(props.inputData);
    this.graph = new Graph();

    this.graph.on('eachNodeAttributesUpdated', this.onEachNodeAttributesUpdated.bind(this));

    props.reset.current = this.reset.bind(this);
    props.saveAsPng.current = this.saveAsPng.bind(this);

    this.data.followerData.forEach((item, idx) => {
      const ref = React.createRef();
      const maxSize = Math.max(item.followersCount, item.followersCount);
      let size = Math.sqrt(Math.min(maxSize, 10000)) / Math.sqrt(10000) * nodeRadius * 2 + nodeRadius;
      let x = (Math.random() - 0.5) * screenSize;
      let y = (Math.random() - 0.5) * screenSize;
      let fixed = false;

      if (item.screenName === this.props.screenName) {
        size = nodeRadius * 4;
      }

      this.graph.addNode(idx, { id: idx, size, x, y, ref, fixed });
    });
    this.setupEdges();
    this.reset();

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

    this.renderEdges();
  }

  public override componentDidMount() {
    this.clearupNodes();
  }

  public override componentWillUnmount() {
    this.layout?.kill();
  }

  public override componentDidUpdate(prevProps: TwitterGraphPropsInner) {
    if (JSON.stringify(prevProps.config.graph) !== JSON.stringify(this.props.config.graph)) {
      this.setupForceAtlas();
    }

    if (JSON.stringify(prevProps.config.edge) !== JSON.stringify(this.props.config.edge)) {
      this.setupEdges();
    }
  }

  saveAsPng() {
    saveAsPng(this.graph, this.props.inputData.friends, this.props.screenName, this.props.config.graph.stroke);
  }

  reset() {
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

  onEachNodeAttributesUpdated() {
    this.graph.forEachNode((_idx, attr) => {
      const ref = attr.ref.current;
      if (ref) {
        ref.setAttribute('cx', attr.x);
        ref.setAttribute('cy', attr.y);
      }
    });

    this.renderEdges();
  }

  renderEdges() {
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
          }
        }
      }
    }
  }

  setupEdges() {
    const { graph } = this;
    this.layout?.kill();
    graph.clearEdges();
    const edgeConfig = this.props.config.edge;

    if (edgeConfig.edgeAlgorithm === 'Basic') {
      var calculator = new BasicEdges(this.data, edgeConfig);
      calculator.updateGraph(graph);
    }
    else if (edgeConfig.edgeAlgorithm === 'TopN') {
      var calculator = new TopNEdges(this.data, edgeConfig);
      calculator.updateGraph(graph);
    }
    else if (edgeConfig.edgeAlgorithm === 'HeapOrder') {
      var calculator = new HeapOrderedEdges(this.data, edgeConfig);
      calculator.updateGraph(graph);
    }

    // const communities = louvain(graph);
    // console.log('communities', communities);
    louvain.assign(graph, {
      resolution: edgeConfig.resolution / 10,
    });

    this.clearupNodes();
    this.setupForceAtlas();
  }

  clearupNodes() {
    const { graph, props: { config } } = this;
    const graphConfig = config.graph;
    let nodes = 0;
    let maxCommunity = 1;
    const communityMap: { [key: number]: number } = {};

    this.graph.forEachNode((_idx, attr) => {
      if (!attr.fixed) {
        if (communityMap[attr.community] === undefined) {
          communityMap[attr.community] = maxCommunity;
          maxCommunity++;
        }
      }
    });

    // Hide all nodes with 0 edges
    graph.updateEachNodeAttributes(
      function (node, attr) {
        const empty = graph.degree(node) === 0;
        const c = communityMap[attr.community];
        const color = `hsl(${c / maxCommunity * 360}, 100%, 50%)`;

        if (attr.fixed !== empty) {
          attr.fixed = empty;
          attr.x = (Math.random() - 0.5) * screenSize;
          attr.y = (Math.random() - 0.5) * screenSize;
        }
        attr.color = color;

        if (!empty) {
          nodes++;
        }

        const ref = attr.ref.current;
        if (ref) {
          ref.style.display = empty ? 'none' : null;
          ref.setAttribute('fill', graphConfig.images ? `url(#profileImage${attr.id})` : color);
          ref.setAttribute('stroke', graphConfig.images && graphConfig.stroke ? color : '');
        }
        return attr;
      },
      { attributes: ['fixed', 'x', 'y', 'color'] }
    );

    this.props.setStats({
      edges: graph.size,
      nodes,
    })
  }

  setupForceAtlas() {
    if (this.layout) {
      this.layout.kill();
      this.layout = undefined;
    }

    const graphConfig = this.props.config.graph;

    if (graphConfig.slowDown > 0) {
      this.layout = new FA2Layout(this.graph, {
        settings: {
          gravity: graphConfig.gravity,
          edgeWeightInfluence: graphConfig.edgeWeightInfluence,
          weight: 'weight',
          weighted: graphConfig.weighted,
          barnesHutOptimize: graphConfig.barnesHutOptimize,
          strongGravityMode: graphConfig.strongGravityMode,
          scalingRatio: graphConfig.scalingRatio,
          slowDown: graphConfig.slowDown,
          linLogMode: graphConfig.linLogMode,
        } as any,
        weighted: graphConfig.weighted,
      });

      // To start the layout
      this.layout.start();
    }

    this.clearupNodes();
  }

  render() {
    const cx = screenSize / 2;
    const cy = screenSize / 2;

    const data = this.data;
    const followerData = data.followerData;

    // <button onClick={this.saveAsPng}>Save as PNG</button>
    return <>
      <div style={{ position: 'absolute', left: '0px', width: '200px', top: '0px', bottom: '0px', overflow: 'auto' }}>
        {this.state.selectedNode && (<UserNodeDetails
          graph={this.graph}
          selected={this.state.selectedNode}
          followerData={followerData}
          slice={data.friendSlice(this.state.selectedNode)}
          data={data}
          mutualOnly={this.props.config.edge.mutualsOnly}
          mouseEnter={this.mouseEnter}
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
            id={user.id}
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

          let src = `/api/twitter/${item.id}/picture`;

          if (item.avatar) {
            src = URL.createObjectURL(
              new Blob([item.avatar], { type: 'image/png' })
            );
          }

          return <pattern key={idx} id={`profileImage${idx}`} x="0%" y="0%" height="100%" width="100%"
            viewBox="0 0 48 48">
            <image x="0%" y="0%" width="48" height="48" xlinkHref={src} id={`twitterImage${idx}`} />
          </pattern>;
        })
      }
    </defs>;
  }
}

interface UserNodeProps {
  idx: number;
  id: string;
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
      strokeWidth="2"
    />;
  }
}
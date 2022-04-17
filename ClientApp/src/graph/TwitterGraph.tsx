import React, { Component, MutableRefObject, RefObject } from 'react';
import Graph from 'graphology';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import { MovableCanvas, Transform } from '../MovableCanvas';

import { InputData, TwitterData, TwitterUserData } from './Data';
import { Config } from './Config';
import { UserNodeDetails } from './SideBar';
import { button, useControls } from 'leva';
import { BasicEdges, TopNEdges } from './Edge';

let screenSize = 12000;
let nodeRadius = 16;

interface TwitterGraphProps {
  screenName: string;
  inputData: InputData;
  config: Config;
}

interface TwitterGraphState {
  selectedNode?: number;
  hover?: number;
}

export const TwitterGraphWithConfig: React.FC<TwitterGraphProps> = props => {

  const resetRef = React.useRef<() => void>();

  const { slowDown, linLogMode, scalingRatio } = useControls('Graph', {
    totalNodes: {
      value: `${props.inputData.friends.length}`,
      editable: false,
    },
    slowDown: {
      value: 100,
      min: 0,
      max: 200,
    },
    scalingRatio: {
      value: 10,
      min: 1,
      max: 30,
    },
    linLogMode: false,
    reset: button(() => {
      if (resetRef.current) {
        resetRef.current();
      }
    }),
  });

  const { edgeAlgorithm, weighted, mutualsOnly, topN, edgeWeights } = useControls('Edge', {
    weighted: false,
    edgeAlgorithm: {
      value: 'TopN',
      options: ['Basic', 'TopN'],
    },
    mutualsOnly: false,
    topN: {
      value: 20,
      min: 1,
      max: 100,
      render: get => get('Edge.edgeAlgorithm') === 'TopN',
    },
    edgeWeights: {
      value: 'ratio',
      options: ['linear', 'ratio'],
      render: get => get('Edge.weighted'),
    },
  });

  const config: Config = {
    ...props.config,
    graph: {
      ...props.config.graph,
      scalingRatio,
      weighted,
      slowDown,
      linLogMode,
    },
    edge: {
      ...props.config.edge,
      edgeAlgorithm,
      edgeWeights,
      mutualsOnly,
      topN,
    },
  };

  return <TwitterGraph {...props} config={config} reset={resetRef} />
};

interface TwitterGraphPropsInner extends TwitterGraphProps {
  reset: MutableRefObject<(() => void) | undefined>;
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

    this.data.followerData.forEach((item, idx) => {
      const ref = React.createRef();
      let size = Math.sqrt(Math.min(item.friendsCount, 10000)) / Math.sqrt(10000) * nodeRadius * 2 + nodeRadius;
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

      this.graph.forEachUndirectedNeighbor(idx, (neighbor, attr) => {
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

  public override componentWillUnmount() {
    this.layout?.kill();
  }

  public override componentDidUpdate(prevProps: TwitterGraphProps, prevState: TwitterGraphState) {
    if (JSON.stringify(prevProps.config.graph) !== JSON.stringify(this.props.config.graph)) {
      this.setupForceAtlas();
    }

    if (JSON.stringify(prevProps.config.edge) !== JSON.stringify(this.props.config.edge)) {
      this.setupEdges();
    }
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
    this.updateId++;
    const count = Math.ceil(this.graph.nodes().length / 1000);
    const id = this.updateId % count;

    this.graph.forEachNode((_idx, attr) => {
      if (attr.id % count === id) {
        const ref = attr.ref.current;
        if (ref) {
          ref.setAttribute('cx', attr.x);
          ref.setAttribute('cy', attr.y);
        }
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
          }
        }
      }
    }
  }

  setupEdges() {
    this.layout?.kill();
    this.graph.clearEdges();
    const edgeConfig = this.props.config.edge;

    if (edgeConfig.edgeAlgorithm === 'Basic') {
      var calculator = new BasicEdges(this.data, edgeConfig);
      calculator.updateGraph(this.graph);
    }

    if (edgeConfig.edgeAlgorithm === 'TopN') {
      var calculator = new TopNEdges(this.data, edgeConfig);
      calculator.updateGraph(this.graph);
    }

    this.setupForceAtlas();
  }

  setupForceAtlas() {
    if (this.layout) {
      this.layout.kill();
    }

    const graphConfig = this.props.config.graph;
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

  render() {
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
          mutualOnly={this.props.config.edge.mutualsOnly}
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

          return <pattern key={idx} id={`profileImage${idx}`} x="0%" y="0%" height="100%" width="100%"
            viewBox="0 0 48 48">
            <image x="0%" y="0%" width="48" height="48" xlinkHref={`/api/twitter/${item.id}/picture`}></image>
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
    />;
  }
}
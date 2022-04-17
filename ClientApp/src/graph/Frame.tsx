import { decode } from '@msgpack/msgpack';
import { useControls } from 'leva';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Config, DataConfig } from './Config';
import { InputData } from './Data';
import { TwitterGraphWithConfig } from './TwitterGraph';

const defaultConfig: Config = {
  data: {
    nodes: 'followers',
    relationship: 'followers',
  },
  edge: {
    edgeAlgorithm: 'TopN',
    topN: 20,
    mutualsOnly: true,
    edgeWeights: 'linear',
  },
  graph: {
    adjustSizes: true,
    barnesHutOptimize: false,
    strongGravityMode: true,
    weighted: false,
    gravity: 0.1,
    slowDown: 100,
    scalingRatio: 10,
    edgeWeightInfluence: 1,
    linLogMode: false,
    // reset: () => this.reset(),
  },
};

export const GraphFrame = () => {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  let { screenName } = useParams<{ screenName: string }>();

  const { nodes, relationship } = useControls({
    nodes: {
      value: params.get('nodes') || 'friends',
      options: ['followers', 'friends'],
    },
    relationship: {
      value: params.get('relationship') || 'friends',
      options: ['followers', 'friends'],
    },
  });

  const config = { nodes, relationship };

  useEffect(() => {
    const newParams = new URLSearchParams();
    newParams.set('nodes', nodes);
    newParams.set('relationship', relationship);

    window.history.pushState(undefined, '', window.location.pathname + '?' + newParams.toString());
  }, [nodes, relationship]);


  return <div style={{ position: 'absolute', left: '0px', right: '0px', top: '0px', bottom: '0px', overflow: 'auto' }}>
    <GraphStateMachine screenName={screenName} config={config as any} />
  </div>;
}


export const GraphStateMachine: React.FC<{ screenName: string; config: DataConfig }> = props => {
  const { config, screenName } = props;
  let [userLoadData, setUserLoadData] = useState<LoadStatus | undefined>();
  let [graphData, setGraphData] = useState<InputData | undefined>();

  useEffect(() => {
    setUserLoadData(undefined);
    setGraphData(undefined);
  }, [screenName, config.nodes, config.relationship]);

  if (!screenName) {
    return <div />;
  }

  if (!userLoadData || !userLoadData.finished) {
    return <UserLoadDataComponent
      screenName={screenName}
      config={config}
      userLoadData={userLoadData}
      setUserLoadData={setUserLoadData}
    />;
  }

  if (!graphData) {
    return <LoadGraphData
      config={config}
      screenName={screenName}
      setGraphData={setGraphData}
    />;
  }

  console.log('graphData', graphData);
  return <TwitterGraphWithConfig inputData={graphData} screenName={screenName} config={defaultConfig} />;
};

interface LoadGraphDataProps {
  screenName: string;
  config: DataConfig;
  setGraphData(data: InputData): void;
}

const LoadGraphData: React.FC<LoadGraphDataProps> = props => {
  const { screenName, config, setGraphData } = props;

  useEffect(() => {
    let active = true;
    async function fetchData() {
      const response = await fetch(`/api/graph/user/${screenName}/matrix?nodes=${config.nodes}&relationship=${config.relationship}`);
      // const json = await response.json();
      const data = decode(await response.arrayBuffer()) as InputData;
      if (active) {
        setGraphData(data);
      }
    }

    fetchData();

    return () => {
      active = false;
    };
  }, [screenName, config.nodes, config.relationship]);

  return <div>Loading graph from server...</div>;
}

interface LoadStatus {
  id: number;
  screenName: string;
  totalWorkItems: number;
  needCollectedCount: number;
  finished: boolean;
  stage: number;
  error: string;
  requesterId: string;
}

interface UserLoadDataComponentProps {
  screenName: string;
  config: DataConfig;
  userLoadData: LoadStatus | undefined;
  setUserLoadData(status: LoadStatus): void;
}

const UserLoadDataComponent: React.FC<UserLoadDataComponentProps> = props => {
  const { screenName, userLoadData, setUserLoadData, config } = props;
  let [timeoutHandle, setTimeoutHandle] = useState<NodeJS.Timeout>();
  let [attempt, setAttempt] = useState(0);

  useEffect(() => {
    async function fetchData() {

      const response = await fetch(`/api/graph/user/${screenName}/status?nodes=${config.nodes}&relationship=${config.relationship}`);
      const json = await response.json();
      setUserLoadData(json);

      if (!json.finished && !json.error) {
        console.log('Set timeout');
        const handle = setTimeout(() => {
          setAttempt(attempt + 1);
          console.log(`Finish timeout ${attempt + 1}`);
        }, 5000);
        setTimeoutHandle(handle);
      }
    }

    fetchData();

    return () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    };
  }, [screenName, setUserLoadData, attempt]);

  if (!userLoadData) {
    return <div>Loading...</div>;
  }

  if (!userLoadData.requesterId) {
    return <div style={{ textAlign: 'center' }}>
      <div>This data has not yet been loaded.</div>
      <div>Please log-in to process {screenName}.</div>
    </div>;
  }

  if (userLoadData.error) {
    return <div style={{ textAlign: 'center' }}>
      <div>Can not load the user.</div>
      <div>{userLoadData.error}.</div>
    </div>;
  }

  return <div style={{ textAlign: 'center' }}>
    <div>Downloading follower data for {screenName}...</div>
    <div>Work items left: {userLoadData.needCollectedCount}. (Total work items in queue: {userLoadData.totalWorkItems})</div>
    <StageDetails screenName={screenName} stage={userLoadData.stage} />
  </div>;
}

const StageDetails: React.FC<{ screenName: string; stage: number; }> = props => {
  const { screenName, stage } = props;
  const totalStages = 4;
  if (stage === 1) {
    return <div>Stage 1/{totalStages}: Waiting to collect {screenName}'s friends...</div>;
  }

  if (stage === 2) {
    return <div>Stage 2/{totalStages}: Collecting {screenName}'s friends profile information...</div>;
  }

  if (stage === 3) {
    return <div>Stage 3/{totalStages}: Waiting to collect {screenName}'s friends friends...</div>;
  }

  if (stage === 4) {
    return <div>Stage 4/{totalStages}: Calculating friendship graph for {screenName}...</div>;
  }

  return <></>;
}


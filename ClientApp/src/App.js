import React, { Component, useEffect, useState } from 'react';
import TwitterGraph from './TwitterGraph';
import { Switch, Route, useParams, Redirect } from 'react-router-dom';
import { LoginTwitterButton } from './components/LoginButton';

import './custom.css'

export default class App extends Component {
    static displayName = App.name;

    render() {
        return <div style={{ position: 'absolute', left: '0px', right: '0px', top: '0px', bottom: '0px' }}>
            <div style={{ position: 'absolute', left: '0px', width: '200px', top: '0px', height: '50px', overflow: 'auto' }}>
                <LoginTwitterButton />
            </div>
            <div style={{ position: 'absolute', left: '0px', right: '0px', top: '50px', bottom: '0px', overflow: 'auto' }}>
                <Switch>
                    <Route path='/graph/:screenName' component={TwitterGraphRoute} />
                    <Route path='/validate' component={TwitterLogin} />
                </Switch>
            </div>
        </div>;
    }
}

const TwitterGraphRoute = () => {
    let { screenName } = useParams();
    let [userLoadData, setUserLoadData] = useState();

    if (userLoadData && userLoadData.finished) {
        return <TwitterGraph screenName={screenName} />;
    }

    return <UserLoadDataComponent
        screenName={screenName}
        userLoadData={userLoadData}
        setUserLoadData={setUserLoadData}
    />;
}

const UserLoadDataComponent = ({ screenName, userLoadData, setUserLoadData }) => {
    let [timeoutHandle, setTimeoutHandle] = useState();
    let [attempt, setAttempt] = useState(0);

    useEffect(() => {
        async function fetchData() {

            const response = await fetch(`/api/graph/user/${screenName}/status`);
            const json = await response.json();
            setUserLoadData(json);

            if (!json.finished) {
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
            clearTimeout(timeoutHandle);
        };
    }, [screenName, setUserLoadData, attempt]);

    return <div>
        <div>Downloading follower data for {screenName}...</div>
        <div>Work items left: {userLoadData?.needCollectedCount}. (Total work items in queue: {userLoadData?.totalWorkItems})</div>
        <StageDetails screenName={screenName} stage={userLoadData?.stage} />
    </div>;
}

const StageDetails = ({ screenName, stage }) => {
    if (stage === 1) {
        return <div>Stage 1: Waiting to collect {screenName}'s friends...</div>;
    }

    if (stage === 2) {
        return <div>Stage 2: Waiting to collect {screenName}'s friends friends...</div>;
    }

    return <></>;
}

const TwitterLogin = () => {

    const [loginResponse, setLoginResponse] = useState(null);

    useEffect(async () => {
        const response = await fetch(`/api/twitter/validate${window.location.search}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const json = await response.json();

        setLoginResponse(json);
    }, []);

    if (loginResponse) {
        return <Redirect to={`/graph/${loginResponse.screenName}`} />;
    }

    return <div>Logging in...</div>;
}
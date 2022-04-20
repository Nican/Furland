import React, { Component, useEffect, useState } from 'react';
import { TwitterGraph } from './graph/TwitterGraph';
import { Switch, Route, useParams, Redirect } from 'react-router-dom';
import { LoginTwitterButton } from './components/LoginButton';
import { GraphFrame } from './graph/Frame';
import { MovableCanvas } from './MovableCanvas';

import './custom.css'

export default class App extends Component {
    static displayName = App.name;

    render() {
        return <div style={{ position: 'absolute', left: '0px', right: '0px', top: '0px', bottom: '0px' }}>
            <div style={{ position: 'absolute', left: '0px', right: '0px', top: '0px', height: '50px', overflow: 'hidden', backgroundColor: "#333" }}>
                <LoginTwitterButton />
                For support: <a href="https://twitter.com/Nican/status/1515778156950552576">@Nican</a>
            </div>
            <div style={{ position: 'absolute', left: '0px', right: '0px', top: '50px', bottom: '0px', overflow: 'auto' }}>
                <Switch>
                    <Route path='/graph/:screenName' component={GraphFrame} />
                    <Route path='/validate' component={TwitterLogin} />
                </Switch>
            </div>
        </div>;
    }
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
        localStorage.setItem('userId', json.id);
    }, []);

    if (loginResponse) {
        return <Redirect to={`/graph/${loginResponse.screenName}`} />;
    }

    return <div>Logging in...</div>;
}
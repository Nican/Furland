import React, { Component } from 'react';

export class LoginTwitterButton extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: false,
        };
    }

    async login() {
        this.setState({ loading: true });
        try {
            const response = await fetch('/api/twitter/redirect');
            const json = await response.json();
            window.location = json.authorizationURL;
        }
        finally {
            this.setState({ loading: false });
        }
    }

    render() {
        // <p>Welcome to the Furland Twitter Graph project.</p>
        // <p>Please login with twitter before proceeding.</p>

        return <div>
            <button onClick={() => this.login()} disabled={this.state.loading}>Login with Twitter</button>
        </div>;
    }
}

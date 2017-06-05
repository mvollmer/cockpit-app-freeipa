import React from "react-lite-cockpit";
import $ from "jquery";

import cockpit from "cockpit";

import "./freeipa.css";

class Hostname extends React.Component {
    constructor() {
        super();

        var proxy = cockpit.dbus("org.freedesktop.hostname1").proxy();
        $(proxy).on("changed", () => { this.setState({}) });

        this.state = { proxy: proxy };
    }

    render() {
        return <span>{this.state.proxy.StaticHostname || "?"}</span>;
    }
}

class App extends React.Component {
    render() {
        return (
            <div className="container-fluid">
                <div className="alert alert-success">
                    <span className="pficon pficon-ok"></span>
                    Hello, <Hostname/>
                </div>
            </div>
        );
    }
}

$(function () {
    React.render(<App/>, $('body')[0]);
    $('body').show();
});

import React, { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <main className="auth"><section className="card">
          <p className="eyebrow">MEDSYNC</p>
          <h1>Unable to load the dashboard</h1>
          <p className="error">{this.state.error.message}</p>
          <button onClick={() => { sessionStorage.removeItem("medsync-session"); localStorage.removeItem("medsync-session"); location.reload(); }}>Reset saved session</button>
        </section></main>
      );
    }
    return this.props.children;
  }
}

import { Component } from "react";

export default class AppRecoveryBoundary extends Component {
  state = {
    failed: false,
    recovering: false,
  };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Client render failed:", error, info);

    if (typeof window.__recoverSmartAttendance === "function") {
      this.setState({ recovering: true });
      window.__recoverSmartAttendance(error).then((recoveryStarted) => {
        if (!recoveryStarted) {
          this.setState({ recovering: false });
        }
      });
    }
  }

  handleRetry = () => {
    window.sessionStorage.removeItem("smart-attendance-recovery-at");
    window.location.reload();
  };

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-950 p-6 text-white">
        <section className="w-full max-w-sm text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-emerald-500" />
          <h1 className="mt-6 text-2xl font-black">
            {this.state.recovering ? "Reopening app..." : "Unable to open app"}
          </h1>
          <p className="mt-2 text-sm font-semibold text-white/65">
            {this.state.recovering
              ? "Updating the app automatically."
              : "Tap below to retry with a fresh app session."}
          </p>
          {!this.state.recovering ? (
            <button
              type="button"
              onClick={this.handleRetry}
              className="mt-6 min-h-14 w-full rounded-2xl bg-emerald-600 font-black text-white"
            >
              Try Again
            </button>
          ) : null}
        </section>
      </main>
    );
  }
}

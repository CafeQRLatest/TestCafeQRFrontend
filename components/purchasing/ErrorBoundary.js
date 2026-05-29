import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error inside purchasing module:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '24px', textAlign: 'center', background: '#fff', borderRadius: '12px', border: '1.5px solid #fca5a5' }}>
          <h3 style={{ color: '#dc2626', margin: '0 0 8px' }}>Something went wrong</h3>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 16px' }}>
            {this.state.error?.message || 'An unexpected error occurred in the Purchase Orders page.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ padding: '8px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

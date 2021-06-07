import React from 'react';

class ErrorTooltip extends React.Component {
  render() {

    return <div className="error-tooltip">
      <header>
        <h3>Suggestion:</h3>
      </header>
      <div className="suggestion-container">
        <span>
          {this.props.suggestion}
        </span>
      </div>
    </div>

  }
}

export { ErrorTooltip }
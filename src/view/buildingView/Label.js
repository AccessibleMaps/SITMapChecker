import React from 'react';

class Label extends React.Component {
  render() {
    return <div className="label">
      <span className="label-name">{this.props.labelName}:</span>
      <span className="label-value">{this.props.labelValue}</span>
    </div>
  }
}

export default Label;
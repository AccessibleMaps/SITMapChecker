import React from 'react';

class MapInformation extends React.Component {
  render() {
    return <div className="map-information">
      <div>
        <span>SIT-Conformity: </span>
        {Math.round(this.props.sitConformity)} %
      </div>
      <div>
        <span>SIT-Coverage: </span>
        {Math.round(this.props.indoorCoverage)} %
      </div>
      <div>
        <span>Accessibility: </span>
        {Math.round(this.props.accessibility)} %
      </div>
      <div>
        <span>Navigability: </span>
        {Math.round(this.props.navigability)} %
      </div>
    </div>
  }
}

export default MapInformation;
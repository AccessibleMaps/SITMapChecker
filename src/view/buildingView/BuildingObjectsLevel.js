import React from 'react';
import { Collapse } from 'reactstrap';
import { BuildingObjectsFeature, getFeatureTitle } from './BuildingObjectsFeature'

class BuildingObjectsLevel extends React.Component {

  constructor(props) {
    super(props)

    this.state = {
      isOpened: false,
      chevronState: ""
    }
  }

  render() {
    return <>
      <li key={this.props.level}>
        <div className="level-name" onClick={this.toggle.bind(this)}>
          <span>{`level ${this.props.level}: `}</span>
          <img alt="chevron" className={this.state.chevronState} width="16px" height="16px" src={`${process.env.PUBLIC_URL}/img/chevron.svg`}></img>
        </div>
      </li>
      <Collapse isOpen={this.state.isOpened}>
        <ul>
          {this.props.features.sort((a, b) => {
            //Sort features numeric
            let textA = getFeatureTitle(a).toUpperCase()
            let textB = getFeatureTitle(b).toUpperCase()
            return textA.localeCompare(textB, undefined, { numeric: true, sensitivity: 'base' })
          }).map(feature => {
            return <BuildingObjectsFeature
              key={feature.id}
              feature={feature}
            />
          })}
        </ul>
      </Collapse>
    </>
  }

  /**
  * Toggles the properties-container of a building-object
  */
  toggle() {
    this.setState({
      isOpened: !this.state.isOpened,
      chevronState: !this.state.isOpened ? "opened" : ""
    })
  }
}

export default BuildingObjectsLevel;
import React from 'react';
import { Collapse } from 'reactstrap';

class BuildingObjectsFeature extends React.Component {

  constructor(props) {
    super(props)

    this.state = {
      isOpened: false,
      chevronState: ""
    }
  }

  render() {
    return <>
      <li key={this.props.feature.id}>
        <div className="feature-name" onClick={this.toggle.bind(this)}>
          <span>{getFeatureTitle(this.props.feature)}</span>
          <img alt="chevron" className={this.state.chevronState} width="16px" height="16px" src={`${process.env.PUBLIC_URL}/img/chevron.svg`}></img>
        </div>
      </li>
      <Collapse isOpen={this.state.isOpened}>
        <ul>
          {Object.keys(this.props.feature.properties.tags).map(key => {
            return <li key={key}>
              <div className="list-item-content">
                <span>{`${key}: `}</span>
                <span>{this.props.feature.properties.tags[key]}</span>
              </div>
            </li>
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

function getFeatureTitle(feature) {
  let tags = feature.properties.tags
  let id = feature.id
  if (tags.indoor) {
    return `${tags.indoor}: ${id}`
  }

  if (tags.door) {
    return `Door: ${id}`
  } else {
    return `Object: ${id}`
  }
}

export { BuildingObjectsFeature, getFeatureTitle }
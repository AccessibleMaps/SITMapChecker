import React from 'react';
import BuildingObjectsLevel from './BuildingObjectsLevel'
import { Collapse } from 'reactstrap';

class BuildingObjects extends React.Component {

  constructor(props) {
    super(props)

    this.state = {
      childTagisOpen: false,
      chevronState: ""
    }
  }

  render() {
    let tags = this.props.buildingObjects.building.properties.tags
    let levels = this.props.buildingObjects.levels

    tags = Object.keys(tags).map(key => (
      <li key={key}>
        <div className="list-item-content">
          <span>{`${key}: `}</span>
          <span>{tags[key]}</span>
        </div>
      </li>
    ))

    levels = levels.map(level => (
      <BuildingObjectsLevel
        key={level.level}
        level={level.level}
        features={level.features}
      />
    ))


    return <div className="building-objects" id="style-1">
      <ul className="parent-list">
        {tags}
        <li>
          <div className="level-name" onClick={this.toggle.bind(this)}>
            <span>levels:</span>
            <img alt="chevron" className={this.state.chevronState} width="16px" height="16px" src={`${process.env.PUBLIC_URL}/img/chevron.svg`}></img>
          </div>
        </li>
        <Collapse isOpen={this.state.childTagisOpen}>
          <ul>
            {levels}
          </ul>
        </Collapse>
      </ul>
    </div>
  }

  /**
  * Toggles the levels-container
  */
  toggle() {
    this.setState({
      childTagisOpen: !this.state.childTagisOpen,
      chevronState: !this.state.childTagisOpen ? "opened" : ""
    })
  }
}

export default BuildingObjects;
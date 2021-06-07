import React from 'react';
import { getAchievementNameById } from '../../utils_own'

class TooltipContent extends React.Component {
  render() {

    let iconPath = `${process.env.PUBLIC_URL}/img/achievement-icons/${this.props.achievementId}.png`

    let preconditions = this.props.achievementPreconditions.map((precondition, index) => {
      let preconditionName = getAchievementNameById(precondition)
      return (
        <div className="precondition" key={index}>
          <img alt={`Icon of ${preconditionName}`} width="35px" src={`${process.env.PUBLIC_URL}/img/achievement-icons/${precondition}.png`} />
          <span>{preconditionName}</span>
        </div>
      )

    })

    return <div className="tooltip-content">
      <header>
        <div className="iconContainer">
          <img alt="Achievement-Icon" width="60px" src={iconPath}></img>
        </div>
        <div className="heading-container">
          <h2>{this.props.achievementName}</h2>
          <span>{this.props.achievementGroup}</span>
        </div>
      </header>
      <div className="container">
        <h3>Description</h3>
        <div className="description-container">{this.props.achievementDescription}</div>
      </div>
      {preconditions.length != 0 &&
        <div className="container">
          <h3>Preconditions</h3>
          <div className="precondition-container">
            {preconditions}
          </div>
        </div>
      }
      <div className="container">
        <h3>Current status</h3>
        <div className="status-container">
          <div className="status-bar-background">
            <div className="status-bar" style={{ width: `${this.props.achievementStatus}%` }}></div>
          </div>
        </div>
      </div>
    </div>

  }
}

export default TooltipContent;
import React from 'react';
import { Popup } from "semantic-ui-react";
import TooltipContent from './TooltipContent';

class AchievementLabel extends React.Component {
  render() {

    let iconPath = `${process.env.PUBLIC_URL}/img/achievement-icons/${this.props.achievementCode}.png`

    return <div className={`achievement-label ${this.props.disabled ? 'disabled' : ''}`}>

      <Popup
        trigger={
          <div>
            <span className="icon-container"><img width="35px" alt={`Icon of ${this.props.achievementName}-achievement`} src={iconPath} /></span>
            <span className="achievement-name">{this.props.achievementName}</span>
          </div>
        }
        position="bottom center"
      >
        <TooltipContent
          achievementName={this.props.achievement.name}
          achievementGroup={this.props.achievement.group}
          achievementId={this.props.achievement.achievementId}
          achievementDescription={this.props.achievement.description}
          achievementPreconditions={this.props.achievement.precondition}
          achievementStatus={this.props.achievement.currentStatus}
        ></TooltipContent>
      </Popup>
    </div>
  }
}

export default AchievementLabel;
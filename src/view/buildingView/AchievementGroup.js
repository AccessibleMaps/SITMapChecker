import React from 'react';
import AchievementLabel from '../utility/AchievementLabel'
import { Collapse } from 'reactstrap';

class AchievementGroup extends React.Component {

  constructor(props) {
    super(props)

    this.state = {
      isOpened: true,
      chevronState: "opened"
    }
  }

  render() {

    let filteredAchievements = []

    if (this.props.achievementList) {
      filteredAchievements = this.props.achievementList.filter(achievement => achievement.group === this.props.groupName).map(achievement => (
        <AchievementLabel
          key={achievement.achievementId}
          achievementCode={achievement.achievementId}
          achievementName={achievement.name}
          achievement={achievement}
        />
      ))
    }

    if (filteredAchievements.length === 0) {
      return null
    }

    return <div className="achievement-group">
      <div className="groupName" onClick={this.toggle.bind(this)}>
        <span>{this.props.groupName}</span>
        <img alt="chevron" className={this.state.chevronState} width="16px" height="16px" src={`${process.env.PUBLIC_URL}/img/chevron.svg`}></img>
      </div>
      <Collapse isOpen={this.state.isOpened}>
        <div className="achievement-container">
          {filteredAchievements}
        </div>
      </Collapse>
    </div>
  }

  /**
  * Toggles the achievement-container
  */
  toggle() {
    this.setState({
      isOpened: !this.state.isOpened,
      chevronState: !this.state.isOpened ? "opened" : ""
    })
  }
}

export default AchievementGroup;
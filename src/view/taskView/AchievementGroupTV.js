import React from 'react';
import AchievementCard from './AchievementCard'
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

    // console.log(this.props)
    if (this.props.achievementList) {
      filteredAchievements = this.props.achievementList.filter(achievement => achievement.group === this.props.groupName).map(achievement => {

        // Convert NaN to 0
        if (isNaN(achievement.currentStatus)) achievement.currentStatus = 0

        return (<AchievementCard
          key={achievement.achievementId}
          achievementCode={achievement.achievementId}
          achievementName={achievement.name}
          achievementGroup={achievement.group}
          tasks={achievement.tasks}
          currentStatus={achievement.currentStatus}
          precondition={achievement.precondition}
          description={achievement.description}
          disabled={!achievement.fulfillable}
        />)
      })
    }

    if (filteredAchievements.length === 0) {
      return null
    }

    return <div className="achievement-group">
      <div className="groupName" onClick={this.toggle.bind(this)}>
        <h2>{this.props.groupName}</h2>
        <img alt="Achievement-Icon" className={this.state.chevronState} width="20px" height="20px" src={`${process.env.PUBLIC_URL}/img/chevron.svg`}></img>
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
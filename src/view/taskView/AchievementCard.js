import React from 'react';
import { Collapse } from 'reactstrap';
import AchievementTask from './AchievementTask';
import { Popup } from "semantic-ui-react";
import TooltipContent from '../utility/TooltipContent';

class AchievementCard extends React.Component {

  constructor(props) {
    super(props)

    this.state = {
      isOpened: false,
      chevronState: ""
    }
  }

  render() {

    let iconPath = `${process.env.PUBLIC_URL}/img/achievement-icons/${this.props.achievementCode}.png`

    let taskList = this.props.tasks.map((task, index) => (
      <AchievementTask
        key={`${task.errorCode}-${index}`}
        name={task.name}
        description={task.errorCode}
        errors={task.errors}
      />
    ))

    return (
      <div className={`achievement-card ${this.props.disabled ? 'disabled' : ''}`}>
        <header className="achievement-header">
          <div className="achievement-icon">
            <Popup
              trigger={
                <img alt={`Icon of ${this.props.achievementName}-achievement`} src={iconPath} />
              }
              position="bottom center"
            >
              <TooltipContent
                achievementName={this.props.achievementName}
                achievementGroup={this.props.achievementGroup}
                achievementId={this.props.achievementCode}
                achievementDescription={this.props.description}
                achievementPreconditions={this.props.precondition}
                achievementStatus={this.props.currentStatus}
              ></TooltipContent>
            </Popup>
          </div>
          <div className="achievement-content">
            <div className="heading-container">
              <h2>{this.props.achievementName}</h2>
              <span>{`${this.props.tasks.length} ${this.props.tasks.length == 1 ? 'Task' : 'Tasks'}`}</span>
            </div>
            <div className="status-bar-container">
              <div className="status-bar-background">
                <div className="status-bar" style={{ width: `${this.props.currentStatus}%` }}></div>
              </div>
            </div>
          </div>
          {!this.props.disabled && <div className="toggle-chevron-container" onClick={this.toggle.bind(this)}>
            <img alt="Chevron-Icon" className={this.state.chevronState} width="20px" height="20px" src={`${process.env.PUBLIC_URL}/img/chevron.svg`}></img>
          </div>}
        </header>
        <Collapse isOpen={this.state.isOpened}>
          <div className="task-container">
            {taskList}
          </div>
        </Collapse>
      </div>
    )
  }

	/**
	 * Toggles the task-container
	 */
  toggle() {
    this.setState({
      isOpened: !this.state.isOpened,
      chevronState: !this.state.isOpened ? "opened" : ""
    })
  }

}

export default AchievementCard;
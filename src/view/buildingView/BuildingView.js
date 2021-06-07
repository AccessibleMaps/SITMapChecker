import React from 'react';
import Label from './Label';
import AchievementGroup from './AchievementGroup';
import achievementGroupList from '../../config/achievements/groups'
import BuildingObjects from './BuildingObjects'

class BuildingView extends React.Component {

  constructor() {
    super();

    this.state = {
      sitLevelCoverage: "-"
    };
  }

  render() {

    let fulfilledAchievements

    if (this.props.achievements) {
      fulfilledAchievements = this.props.achievements.filter((achievement) => achievement.fulfilled)
    }

    return <div className="building-view">
      <h1>Building Information</h1>
      <span className="subtitle">{this.props.buildingName}</span>
      {this.props.buildingName !== "no building selected" &&
        <>
          <div className="building-information-labels">
            <Label
              labelName="SIT-Coverage"
              labelValue={`${this.props.sitCoverage ? this.props.sitCoverage : '-'} %`}
            />
            <Label
              labelName={`SIT-Coverage of Level ${this.props.currentLevel}`}
              labelValue={`${this.state.sitLevelCoverage} %`}
            />
          </div>
          <h2>Achievements:</h2>
          <div className="achievement-list">
            {achievementGroupList.map((groupName, i) => {
              return (
                <AchievementGroup
                  key={i + groupName}
                  groupName={groupName}
                  achievementList={fulfilledAchievements}
                />
              )
            })}
          </div>
          <h2>Building Objects:</h2>
          <BuildingObjects
            buildingObjects={this.props.buildingObjects}
          />
        </>}
    </div>
  }

  shouldComponentUpdate(nextProps) {
    if (nextProps.sitLevelCoverages !== this.props.sitLevelCoverages | nextProps.currentLevel !== this.props.currentLevel) {
      //temporary solution - because currentLevel state is sometimes delayed and buggy
      setTimeout(() => { this.updateLevelCoverageForCurrentLevel() }, 1)
    }
    return true
  }

  /**
  * Returns the level coverage of the current level
  * @Return {number} - sit-coverage of the current level 
  */
  updateLevelCoverageForCurrentLevel() {

    if (!this.props.sitLevelCoverages) { console.log("SIT-Level-Coverages is not defined"); return false }

    //Find the level in the sitLevelCoverages array which fits the currentLevel
    const currentCoverage = this.props.sitLevelCoverages.find((level) => level[0] === this.props.currentLevel)

    this.setState({
      sitLevelCoverage: currentCoverage[1]
    })
  }

}

export default BuildingView;
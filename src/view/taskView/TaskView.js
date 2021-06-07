import React from 'react';
import FilterContainer from './FilterContainer';
import AchievementGroupContainer from './AchievementGroupContainer';

class TaskView extends React.Component {

  constructor(props) {
    super(props)

    this.state = {
      currentFilters: [],
      currentSearchterm: "",
    }
  }

  render() {

    let openAchievements = this.props.achievements.filter((achievement) => !achievement.fulfilled)

    return <div className="task-view">
      <h1>Warnings & Errors</h1>
      <FilterContainer
        achievementList={openAchievements}
        onSearchTermChange={this.onSearchTermChange.bind(this)}
        onFilterChange={this.onFilterChange.bind(this)}
      />
      <AchievementGroupContainer
        openAchievements={openAchievements}
        searchTerm={this.state.currentSearchterm}
        filters={this.state.currentFilters}
      />
    </div>
  }

  /**
  * Sets the current searchterm
  * @param searchTerm - searchTerm for achievements to be filtered
  */
  onSearchTermChange(searchTerm) {
    this.setState({
      currentSearchterm: searchTerm
    })
  }

  /**
  * Updates the currentFilters state
  * @param {boolean} addToList - if true/false itemID is added/removed from currentFilters
  * @param {string} itemID - achievementId of the item to add/remove
  */
  onFilterChange(addToList, itemID) {
    let filters = this.state.currentFilters

    if (addToList && !filters.includes(itemID)) {
      filters.push(itemID)
    }
    else if (!addToList) {
      filters = filters.filter(item => item !== itemID)
    }

    this.setState({
      currentFilters: filters
    })
  }

}

export default TaskView;
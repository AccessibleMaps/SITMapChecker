import React from 'react';
import AchievementGroupTV from './AchievementGroupTV';
import achievementGroupList from '../../config/achievements/groups'

class AchievementGroupList extends React.Component {

  render() {

    return (
      <div className="achievement-group-container">
        {this.getAchievementGroups()}
      </div>
    )
  }

  /**
   * Returns the filtered Achviement-Groups
   * @return List of filtered Achievements-Groups
   */
  getAchievementGroups() {

    let openAchievements = this.props.openAchievements
    let searchTerm = this.props.searchTerm
    let filters = this.props.filters
    let filteredAchievements = this.applyFilters(openAchievements, searchTerm, filters)

    return achievementGroupList.map((groupName, i) => {
      return (
        <AchievementGroupTV
          key={i + groupName}
          groupName={groupName}
          achievementList={filteredAchievements}
        />
      )
    })
  }

  /**
	 * Applies the filters from the filter container & searchfield
   * @param listToFilter - list to be filtered
   * @param searchTerm - string which should be included in  the achviement-names
   * @param filterArray - list with achievements to keep in the returned list
   * @return returns a list with filtered achievements
	 */
  applyFilters(listToFilter, searchTerm, filterArray) {

    let filteredItems = listToFilter
    filterArray = filterArray.map(filter => filter.toLowerCase())

    //Apply search
    searchTerm = searchTerm.toLowerCase()

    if (searchTerm !== "") {
      filteredItems = listToFilter.filter(achievement => achievement.name.toLowerCase().includes(searchTerm))
    }

    //Apply Filters
    if (filterArray.length) {
      filteredItems = filteredItems.filter((achievement) => {
        if (filterArray.some(filter => filter === achievement.achievementId.toLowerCase())) {
          return true
        }
        else {
          return false
        }
      })
    }
    else {
      filteredItems = []
    }

    return filteredItems
  }

}

export default AchievementGroupList;
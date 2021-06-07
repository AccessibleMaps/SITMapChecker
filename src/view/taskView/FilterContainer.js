import React from 'react';
import CheckboxItem from './CheckboxItem';
import { Collapse } from 'reactstrap';

class FilterContainer extends React.Component {


  constructor(props) {
    super(props)

    this.state = {
      filterBoxOpen: false,
      filterBoxChevronState: ""
    }
  }


  render() {

    if (!this.props.achievementList) {
      return null
    }

    return (
      <div className="filter-container">
        <div className="searchbarContainer">
          <input type="search" placeholder="Search for an achievement" onChange={this.handleSearchInputEvent.bind(this)} />
        </div>
        <div className="filter-caption" onClick={this.toggleFilterBox.bind(this)}>
          <span>Filter:</span>
          <img alt="chevron" className={this.state.filterBoxChevronState} width="16px" height="16px" src={`${process.env.PUBLIC_URL}/img/chevron.svg`}></img>
        </div>
        <Collapse isOpen={this.state.filterBoxOpen}>
          <div className="checkbox-container">
            {this.props.achievementList.sort((a, b) => a.name.localeCompare(b.name)).map((achievement) => (
              <CheckboxItem
                key={achievement.achievementId}
                achievementId={achievement.achievementId}
                achievementName={achievement.name}
                onFilterChange={this.props.onFilterChange}
                achievement={achievement}
                disabled={!achievement.fulfillable}
              />
            ))}
          </div>
        </Collapse>
      </div>
    )
  }

  /**
  * Toggles the checkbox-container
  */
  toggleFilterBox() {
    this.setState({
      filterBoxOpen: !this.state.filterBoxOpen,
      filterBoxChevronState: !this.state.filterBoxOpen ? "opened" : ""
    })
  }

  /**
  * Calls the onSearchTermChange of the given props
  @param event - event when something is typed in the searchfield
	*/
  handleSearchInputEvent(event) {
    this.props.onSearchTermChange(event.target.value)
  }
}

export default FilterContainer;
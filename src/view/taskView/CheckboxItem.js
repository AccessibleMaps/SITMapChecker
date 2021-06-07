import React from 'react';
import AchievementLabel from '../utility/AchievementLabel';

class CheckboxItem extends React.Component {

  constructor(props) {
    super(props)
    this.state = {
      checked: !this.props.disabled
    }

    this.props.onFilterChange(!this.props.disabled, this.props.achievementId)
  }

  render() {
    return (
      <div className='checkbox-item'>
        <input type="checkbox" id={this.props.achievementId} checked={this.state.checked} onChange={this.handleCheckbox.bind(this)} />
        <label htmlFor={this.props.achievementId} ></label>
        <AchievementLabel
          achievementCode={this.props.achievementId}
          achievementName={this.props.achievementName}
          achievement={this.props.achievement}
          disabled={this.props.disabled}
        />
      </div >
    )
  }

  /**
	 * Toggle checkbox
	 */
  handleCheckbox() {
    this.props.onFilterChange(!this.state.checked, this.props.achievementId)
    this.setState({
      checked: !this.state.checked
    })
  }
}

export default CheckboxItem;
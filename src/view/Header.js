import React, { Component } from 'react';

import Navbar from 'react-bootstrap/Navbar';

/**
 * Header component handles the whole header bar.
 */
class Header extends Component {
  render() {

    return <Navbar className={this.props.className} bg="light" expand="xs">
      <h1>SIT-MapChecker</h1>
      <div>
        <div>
          <span className="switch-caption">Multiple Building Analyzer </span>
          <label name="multibuildingswitchSwitch" className="switch">
            <input type="checkbox" onChange={this.props.toggleMultiBuilding} />
            <span className="slider round"></span>
          </label>
        </div>
        <div>
          <span className="switch-caption">Accessibility: </span>
          <label name="accessibilitySwitch" className="switch">
            <input type="checkbox" onChange={this.props.toggleAccessibilityMode} />
            <span className="slider round"></span>
          </label>
        </div>
      </div>
    </Navbar>;
  }
}

export default Header;

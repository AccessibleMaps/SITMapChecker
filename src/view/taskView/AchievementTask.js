import { Collapse } from 'reactstrap';
import React from 'react';
import { ErrorTooltip } from './ErrorTooltip.js';
import { Popup } from "semantic-ui-react";
import PubSub from "pubsub-js";

class AchievementTask extends React.Component {

    constructor(props){
        super(props)      
    
        this.state = {
          isOpened: false,
          chevronState: ""     
        } 

        // name of the coverage task to enable highlighting for hovering over this specific task
        this.coverageName = require("../UItext.json")["COV"]["tasks"]["COV-1"]["name"];
    }

    // Toggles on the highlighting of consistently (SIT- & geometrically) typed areas on the current level in Map.js
    // by setting the Body's state.
    enableCoveredHighlighting=(name)=>{
        if (name === this.coverageName){
            PubSub.publish("map.highlightCovered", {});
        }
    }
    
    // Toggles off the highlighting of consistently (SIT- & geometrically) typed areas on the current level in Map.js
    // by setting the Body's state.
    disableCoveredHighlighting=(name)=>{
        if (name === this.coverageName){
            PubSub.publish("map.clearMap", {});
        }
    }

    // On mouse enter, the map level will be changed if the current map level is not relevant to a specific error ('onMouseEnter=true' mode).
    // Afterwards, the highlighting of the error's references will be triggered by setting the Body's state.
    // Because a change of the map level undoes the highlighting of error references, the map level needs to be set synchronously before highlighting an error.
    handleErrorMouseEnter=(errorId, references)=>{
        
        PubSub.publishSync("map.level.set", {
            id: errorId,
            references: references,
            onMouseEnter: true
        });

        PubSub.publish("map.highlightError", {
            id: errorId,
            references: references
        });
    }
    
    // On mouse out, the error highlighting will be removed by setting the Body's state.
    handleErrorMouseOut=()=>{  
        PubSub.publish("map.clearMap", {});
    }
    
    // On mouse click, the map level will be changed to the next level relevant to a specific error ('oneMouseEnter=false' mode).
    // Because a change of the map level undoes the highlighting of error references, the highlighting process will be triggered again after.
    // 'PubSub.publish("body.highlightedError.set", ...' doesn't need to be called for that, because the Body's state's highlightedError prop
    // will still be set by 'handleErrorMouseEnter'.
    handleErrorMouseClick=(errorId, references)=>{

        PubSub.publish("map.level.set", {
            id: errorId,
            references: references,
            onMouseEnter: false
        });

    }
  
  
  render() {
    let iconPath = `${process.env.PUBLIC_URL}/img/`
    let altText
    let errors = this.props.errors.sort((a, b) => {
      return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
    }).map((error, index) => {

      let symbolPath = `${process.env.PUBLIC_URL}/img/`
      if (error.type.toLowerCase() === 'error') {
        symbolPath += 'error.png'
      }
      else {
        symbolPath += 'warning.png'
      }

      return (

        <Popup key={`${error.objectId}-${index}`}
          trigger={
            <li className="error-list-item" key={`${error.objectId}-${index}`}>
              <img alt="Error-Icon" width="30px" height="30px" src={symbolPath} />
              <span className="error-title" onMouseEnter={() => this.handleErrorMouseEnter(error.id, error.references)} onMouseOut={this.handleErrorMouseOut} onClick={() => this.handleErrorMouseClick(error.id, error.references)}>{error.title}</span>
            </li>
          }
          position="bottom center"
        >
          <ErrorTooltip
            suggestion={error.suggestion}
          />
        </Popup>
      )
    })


    if (this.props.errors.length === 0) {
      iconPath += `check.png`
      altText = 'Checkmark-Icon'
    }
    else {
      iconPath += `error.png`
      altText = 'Error-Icon'
    }

    return (
      <div className="task-item">
        <header className="task-header" onClick={this.toggle.bind(this)}> 
          <div className="task-icon">
            <img alt={altText} width="25px" height="25px" src={iconPath} />
          </div>
          <span className="task-content" onMouseEnter={() => this.enableCoveredHighlighting(this.props.name)} onMouseOut={() => this.disableCoveredHighlighting(this.props.name)}>
            {this.props.name}
          </span>
          <div className="toggle-chevron-container">
            {errors.length !== 0 && <img alt="Chevron-Icon" className={this.state.chevronState} width="18px" height="18px" src={`${process.env.PUBLIC_URL}/img/chevron.svg`}></img>
            }
          </div>
        </header>
        {errors.length !== 0 &&
          <Collapse isOpen={this.state.isOpened}>
            <ul className="error-list">
              {errors}
            </ul>
          </Collapse>
        }
      </div>
    )
    }

  /**
  * Toggles the error-list
  */
  toggle() {
    this.setState({
      isOpened: !this.state.isOpened,
      chevronState: !this.state.isOpened ? "opened" : ""
    })
  }

}

export default AchievementTask;

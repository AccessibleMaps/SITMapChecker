import {addCoverageInfo} from "../view/analysisToVisObj";
import {SITAnalyzer} from "./sitConf";
import {TAGAnalyzer} from "./TagCtrl";
import NavigationControl from './NavigationControl';

const { Component } = require("react");
/**
 * MultiBuildingAnalyzer is the class which is needed for analyzing multiple buildings at once
 */
class MultiBuildingAnalyzer extends Component{
    constructor(map){
        super();
        this.buildingPercentages={};
        this.semanticBuildingColors=[];
        this.globalPercentages={"coverage":0,"conformity":0,"accessibility":0,"navigability":0};
        this.map=map;
    }

    /**
     * This function analyzes all buildings currently in the cache for its different achievement statuses. 
     */
    analyzeBuildingStack(){
        this.sitAnalyzer = new SITAnalyzer();

        //get all buildings in cache via vectorDataManager as object {type: fetureCollection, features: array[]}
        var buildings = window.vectorDataManager.getOSMBuildings();

        //iterate through each building to get percentages for the achievment categories. This goes analogue to ANalysisToVis for the analysis part but without the building of the achievments and errors.
        for (var building of buildings.features){

            //general build-up (build needed objects for analysis)
            let buildingObj = building; //for easier integration of code from AnalysisToVis
            var buildingWithLevels=this.map.makeBuildingObject(building);
            this.buildingPercentages[building.id]={"coverage":0,"conformity":0,"reachability":0,"accessibility":0}
            //create a current building to use as in AnalysisToVis
            let currentBuilding = {
                selected:   true,
                name:       buildingObj.properties.tags.hasOwnProperty("name") ? buildingObj.properties.tags.name : "none",
                type:       !buildingObj.properties.tags.hasOwnProperty("building") ? "none" : buildingObj.properties.tags.building !== "yes" ? buildingObj.properties.tags.building : "no specific type",
                buildingObjects: buildingWithLevels
            }

            //here the different percentages for the categories are build. 
            //coverage
            addCoverageInfo(currentBuilding,buildingWithLevels); //use the function which builds the sitCoverage
            this.globalPercentages.coverage += currentBuilding.sitCoverage; //add percentage value to global sum
            this.buildingPercentages[building.id].coverage=currentBuilding.sitCoverage;
            
            //conformity
            //analyze according to analysisToVis
            this.sitAnalyzer.analyzeBuilding(building);
            var tagAnalyzer = new TAGAnalyzer(this.sitAnalyzer.correctSITTypeObjects, building);
            tagAnalyzer.checkTagsForSIT();  
            this.sitAnalyzer.addTagNonConformObjects(tagAnalyzer.nonConformObjects);
            this.sitAnalyzer.finishBuildingAnalysis(building);
            this.globalPercentages.conformity += this.sitAnalyzer.sitConfStatus; //add percentage value to global sum
            this.buildingPercentages[building.id].conformity=this.sitAnalyzer.sitConfStatus;

            //Accessibility
            //analyze according to analysisToVis
            tagAnalyzer.checkTagsForAccessibility();
            var accessibilityPercent =(tagAnalyzer.accDoorBasicPercentage*100)+(tagAnalyzer.accStairsBasicPercentage*100)+(tagAnalyzer.accElevBasicPercentage*100)+(tagAnalyzer.accWCPercentage*100)+(tagAnalyzer.accTACPercentage*100)+(tagAnalyzer.accDoorPremiumPercentage*100)+(tagAnalyzer.accStairsPremiumPercentage*100)+(tagAnalyzer.accElevPremiumPercentage*100); //add all sub percentages
            this.globalPercentages.accessibility+=accessibilityPercent/8; //devide by number of subpercentages and add percentage value to global sum
            this.buildingPercentages[building.id].accessibility=accessibilityPercent/8;

            //reachability
            //analyze according to analysisToVis
            var navigationControl = new NavigationControl(this.map, buildingWithLevels, this.sitAnalyzer.correctSITTypeObjects);
            var navigationPercent=(navigationControl.roomsWithDoorsPercent()*100)+(navigationControl.reachableLevelsPercent()*100)+(navigationControl.reachablePercent()*100);//add all sub percentages
            if(navigationControl.checkBuildingEntrance()){ //add 100 if buuildingEntrance exists
                navigationPercent+=100;
            }
            this.globalPercentages.reachability+=navigationPercent/4;//devide by number of subpercentages and add percentage value to global sum
            this.buildingPercentages[building.id].reachability=navigationPercent/4;
        }
        
        //devide all values by number of buildings in cache
        this.globalPercentages.accessibility /= buildings.features.length;
        this.globalPercentages.conformity /= buildings.features.length;
        this.globalPercentages.coverage /= buildings.features.length;
        this.globalPercentages.reachability /= buildings.features.length;
        this.claculateSemanticBuildingColors(buildings.features);

        
    }

    /**
     * @private
     * @param {Object} buildings The building features, for which the colors  are calculated
     */
    claculateSemanticBuildingColors(buildings){
        for (var building of buildings){
            var percentages = this.buildingPercentages[building.id];
            var colorValue = ((percentages.accessibility/100)*0.25)+((percentages.conformity/100)*0.25)+((percentages.coverage/100)*0.25)+((percentages.reachability/100)*0.25);
            var red =0;
            var green =0;
            if(colorValue<0.5&&colorValue>=0){
                red=255;
                green = 50 + colorValue*2*205;
            }
            else if(colorValue>=0.5&&colorValue<=1){
                green = 255;
                red = ((1-colorValue)*2*104)+151;
            }
            var color = "#"+this.rgbToHex(Math.floor(red))+this.rgbToHex(Math.floor(green))+"00";
            this.semanticBuildingColors.push({"id":building.id,"color":color,"value":colorValue}); 
        }
    }

    /**
     * 
     * @param {Number} value a value between 0 and 255 for a R or G or B value
     * @return {String} the double digit hex value for rgb in hex. 
     */
    rgbToHex(value){
        var hex = Number(value).toString(16);
            if (hex.length < 2) {
                hex = "0" + hex;
            }
        return hex;
    }

}
export default MultiBuildingAnalyzer;
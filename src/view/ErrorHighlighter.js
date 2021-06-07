import L from 'leaflet';
import {point, lineString, polygon} from '@turf/helpers';

// Object providing the functions for highlighing of errors and features in general.
// A leaflet map element reference on which the highlights should appear must be set before using
// any of the object's functions.
// The highlighting of some errors needs intermediate analysis results stored in the SITAnalyzer instance and
// NavigationControl instance of the current building (returned at the end of an analysis by analysisToVisObj()), which
// need to be set for each building before using the highlighting functions.
class ErrorHighlighter extends Object {
    constructor(SITAnalyzer){
        super();

		this.coverageLayer = [];
		this.mapElement = null;
		this.highlightedLevel = null;
		this.currentNavigationControl = null;
		this.currentBuildingId = null;
		this.SITAnalyzer = SITAnalyzer;

		// Red circular marker.
        this.geojsonMarkerOptions = {
			radius: 8,
			fillColor: "#ff0000",
			color: "#000",
			weight: 5,
			opacity: 1,
			fillOpacity: 0.8
        };
		
		// Areas with red borders and transparently red filling.
        this.myStyle = {
			"color": "#ff0000",
			"weight": 5,
			"opacity": 1
		};
    }

	// Function which handles highlighting of all errors.
	// errorId: ID of the type of the error to be handled. Determines how the references will be used for highlighting (property of error objects).
	// references: References of a specfic error that determine what will be highlighted (property of error objects).
    highlightError(errorId, references){ 

		if (errorId === null){return;}

		this.clearMap();

		// Self-intersections of an object's line strings (of a 'LineString', 'Polygon' or 'MultiPolygon' geometry).
		// Highlight the feature itself (line or area) and the intersection points.
		if (["INTERSECT-1", "INTERSECT-2"].includes(errorId)){
			this.highlightFeature(window.vectorDataManager.findFeature(references[1]));
			let errorPointsCoords = references[3];
			for (const pointCoords of errorPointsCoords){
				this.highlightFeature(point(pointCoords));
			}
		}

		// Self-intersections of an object's line strings (of a 'LineString', 'Polygon' or 'MultiPolygon' geometry) via superposed line segments.
		// Highlight the feature itself (line or area) and the problematic line segments, with start and end point, in a different color.
		else if (errorId === "INTERSECT-3"){
			this.highlightFeature(window.vectorDataManager.findFeature(references[1]));
			let superposedLineSegmentsCoords = this.parseIntersect3References(references[3]);
			let lineSegmentStyle = {
				"color": "#0000ff",
				"weight": 5,
				"opacity": 1
			};
			for (const superposedLineSegmentCoords of superposedLineSegmentsCoords){	
				this.highlightFeature(point(superposedLineSegmentCoords[0]));
				this.highlightFeature(point(superposedLineSegmentCoords[1]));
				this.highlightFeature(lineString(superposedLineSegmentCoords), lineSegmentStyle);
			}
		}

		// Overlap of two level features.
		// Highlight both level features, the second in another color.
		else if (errorId === "LVLOVERLAP-1"){
			let secondFeatureStyle = {
				"color": "#0000ff",
				"weight": 5,
				"opacity": 1
			};
			this.highlightFeature(window.vectorDataManager.findFeature(references[0]));
			this.highlightFeature(window.vectorDataManager.findFeature(references[1]), secondFeatureStyle);
		}

		// Intersecting subpolygons of a polygon (of a 'Polygon' or 'MultiPolygon' geometry).
		// Highlight the feature itself (one or multiple areas) and the intersecting subpolygons (one or multiple area pairs) in another color.
		else if (errorId === "POLY-1"){
			let feature = window.vectorDataManager.findFeature(references[0]);
			this.highlightFeature(feature);
			let subPolygonStyle = {
				"color": "#0000ff",
				"weight": 5,
				"opacity": 1
			};
			let highlightedSubPolygons = [];
			for (const overlappingSubPolygonPair of references[2]){
				if (!highlightedSubPolygons.includes[overlappingSubPolygonPair[0]]){
					if (feature.geometry.type === "Polygon"){
						this.highlightFeature(polygon([feature.geometry.coordinates[overlappingSubPolygonPair[0]]]), subPolygonStyle);
					}
					// 'feature.geometry.type === "MultiPolygon"' = true
					else {
						this.highlightFeature(polygon([feature.geometry.coordinates[references[3]][overlappingSubPolygonPair[0]]]), subPolygonStyle);
					}
					highlightedSubPolygons.push(overlappingSubPolygonPair[0]);		
				}
				if (!highlightedSubPolygons.includes[overlappingSubPolygonPair[1]]){
					if (feature.geometry.type === "Polygon"){
						this.highlightFeature(polygon([feature.geometry.coordinates[overlappingSubPolygonPair[1]]]), subPolygonStyle);
					}
					// 'feature.geometry.type === "MultiPolygon"' = true
					else {
						this.highlightFeature(polygon([feature.geometry.coordinates[references[3]][overlappingSubPolygonPair[1]]]), subPolygonStyle);
					}
					highlightedSubPolygons.push(overlappingSubPolygonPair[1]);
				}
			}
		}

		// Inner subpolygons of a polyogn (of a 'Polygon' or 'MultiPolygon' geometry) that are not fully contained by the outer subpolygon.
		// Highlight the feature (one or multiple areas) and the not fully contained subpolygons (one or multiple areas) in another color.
		else if (errorId === "POLY-2") {
			let feature = window.vectorDataManager.findFeature(references[0]);
			let subPolygonStyle = {
				"color": "#0000ff",
				"weight": 5,
				"opacity": 1
			};
			this.highlightFeature(feature);
			for (const notFullyContainedInnerSubPolygon of references[2]){
				if (feature.geometry.type === "Polygon"){
					this.highlightFeature(polygon([feature.geometry.coordinates[notFullyContainedInnerSubPolygon]]), subPolygonStyle);	
				}
				// 'feature.geometry.type === "MultiPolygon"' = true
				else {
					this.highlightFeature(polygon([feature.geometry.coordinates[references[3]][notFullyContainedInnerSubPolygon]]), subPolygonStyle);
				}
			}
		}

		// Some polygons of a multi-polygon building overlap.
		// Highlight the building (one or multiple areas) and the overlapping (sub-)polygons (on or multiple area pairs) in another color. 
		else if (errorId === "MULTIPOLY-2"){
			let feature = window.vectorDataManager.findFeature(references[0]);
			let subPolygonStyle = {
				"color": "#0000ff",
				"weight": 5,
				"opacity": 1
			};
			this.highlightFeature(feature);
			let highlightedSubPolygons = [];
			for (const overlappingSubPolygonPair of references[1]){
				if (!highlightedSubPolygons.includes[overlappingSubPolygonPair[0]]){
					this.highlightFeature(polygon(feature.geometry.coordinates[overlappingSubPolygonPair[0]]), subPolygonStyle);
					highlightedSubPolygons.push(overlappingSubPolygonPair[0]);
				}
				if (!highlightedSubPolygons.includes[overlappingSubPolygonPair[1]]){
					this.highlightFeature(polygon(feature.geometry.coordinates[overlappingSubPolygonPair[1]]), subPolygonStyle);
					highlightedSubPolygons.push(overlappingSubPolygonPair[1]);
				}
			}
		}

		// The building is intersected by a feature (of 'LineString' or 'Polygon' geometry) that does not have a valid 'level' or 'repeat_on' tag.
		// Highlight the feature (a line or an area) and the building (one or multiple areas) in another color.
		else if (errorId === "BUILDING-INTERSECT-1"){
			let buildingStyle = {
				"color": "#0000ff",
				"weight": 5,
				"opacity": 1
			};
			let feature = window.vectorDataManager.findFeature(references[0]);
			this.highlightFeature(window.vectorDataManager.findFeature(this.currentBuildingId), buildingStyle);
			this.highlightFeature(feature);
		}

		// A feature with a valid 'level' or 'repeat_on' tag intersects the building's borders on some levels, defined by the building feature and optionally by level features for some levels.
		// Highlight the intersecting feature, and the building's area in another color. This is either the building feature, if no level features are present on the current level set by the 
		// highlighting process (should be set by the owner of the ErrorHighlighter instance), or the level features on the current levels.
		else if (errorId === "BUILDING-INTERSECT-2"){
		
			let feature = window.vectorDataManager.findFeature(references[0]);
			let levelFeatureStyle = {
				"color": "#0000ff",
				"weight": 5,
				"opacity": 1
			};

			let levelFeaturesHighlighted = false;
			for (const intersectedLevelFeatureId of references[2]){
				let levelFeatureId = intersectedLevelFeatureId.replace(/'/g, "");
				let levelFeature = window.vectorDataManager.findFeature(levelFeatureId);
				if (levelFeature.properties.own.levels.includes(this.highlightedLevel)){
					this.highlightFeature(levelFeature, levelFeatureStyle);
					levelFeaturesHighlighted = true;
				}
			}

			if (!levelFeaturesHighlighted){
				this.highlightFeature(window.vectorDataManager.findAssociatedBuilding(feature), levelFeatureStyle);
			}
			this.highlightFeature(feature);
		}

		// Two building features overlap.
		// Highlight the overlapping, not currently selected building, and the currently selected building in another color.
		else if (errorId === "BUILDING-OVERLAP-1"){
			let building = window.vectorDataManager.findFeature(this.currentBuildingId);
			let comparisonBuilding = window.vectorDataManager.findFeature(references[0]);
			let buildingStyle = {
				"color": "#0000ff",
				"weight": 5,
				"opacity": 1
			}
			this.highlightFeature(building, buildingStyle);
			this.highlightFeature(comparisonBuilding);
		}

		// A multi-level door is situated on a wall representation (of 'LineString', 'Polygon' or 'MultiPolygon' geometry) on only some levels.
		// Highlight the door feature (a point) and the feature it's situated on, if the level set by the highlighting process (should be set by the owner of the ErrorHighlighter instance)
		// is the one where this underlaying feature is.
		else if (errorId === "MULTILVLDOOR-1"){
			this.highlightFeature(window.vectorDataManager.findFeature(references[0]));
			if (references[3].includes(this.highlightedLevel)){
				this.highlightFeature(window.vectorDataManager.findFeature(references[2]));
			}
		}

		// A feature (of 'Polygon' geometry) is not reachable.
		// Highlight the feature and the reachable features of the level set by the highlighting process (should be set by the owner of the ErrorHighlighter instance) 
		// (of 'Polygon' geometry) in another color.
		else if (errorId === "REACH-1"){

			this.highlightFeature(window.vectorDataManager.findFeature(references[0]));
					
			let reachableStyle = {
				"color": "#0000ff",
				"weight": 5,
				"opacity": 1
			};
			let allAreas = this.currentNavigationControl.getRoomList();
			for (const feature of allAreas){
				if (feature.outsidereachable && feature.properties.own.levels.includes(this.highlightedLevel)){
					this.highlightFeature(window.vectorDataManager.findFeature(feature.id), reachableStyle);
				}
			}

			let whiteBaseAreStyle = {
				"color": "#ffffff",
				"weight": 5,
				"opacity": 1
			};
			this.highlightFeature(window.vectorDataManager.findFeature(references[0]), whiteBaseAreStyle);
			this.highlightFeature(window.vectorDataManager.findFeature(references[0]));
		}

		// All other cases: Get existing IDs in the error's references and highlight their features.
		// LVL-REACH neither highlights features via specific nor general error handling, because it only sets the map level to the problematic level. 
		else if (errorId !== "LVLREACH-1") {
		
			let faultyrooms = [];
			let faultynodes = [];
			for(let i = 0; i < references.length; i++){
				if(typeof references[i] === 'string' && (references[i].includes("way/"))){
					faultyrooms.push(references[i]);
				}
			}
			for(let i = 0; i < references.length; i++){
				if(typeof references[i] === 'string' && (references[i].includes("node/"))){
					faultynodes.push(references[i]);
				}
			}
			for(let j = 0; j < faultyrooms.length; j++){
				let feature = window.vectorDataManager.findFeature(faultyrooms[j]);
				console.log(feature.properties.tags.level);
				this.highlightFeature(feature);
			}
			for(let j = 0; j < faultynodes.length; j++){
				let feature = window.vectorDataManager.findFeature(faultynodes[j]);
				console.log(feature.properties.tags.level);
				this.highlightFeature(feature);
			}
		}
	}
	
	// Highlights features of all kinds of geometry. One can provide an individual style with the optional 
	// "style" parameter, otherwise a default style will be used.
	highlightFeature(feature, style){

		// Highlighting of point features.
		if (feature.geometry.type === "Point"){
			let geojsonMarkerOptions;
			if (style === undefined){
				geojsonMarkerOptions = this.geojsonMarkerOptions;
			}
			else {
				geojsonMarkerOptions = style;
			}

			this.coverageLayer.push(
				L.geoJSON(feature, {
				pointToLayer: function (pointFeature, latlng) {
					return L.circleMarker(latlng, geojsonMarkerOptions);
				}} ).addTo(this.mapElement)
			);	
		}

		// Highlighting of all geometrically different features.
		else {
			let myStyle;
			if (style === undefined){
				myStyle = this.myStyle;
			}
			else {
				myStyle = style;
			}

			this.coverageLayer.push(L.geoJSON(feature, {style : myStyle} ).addTo(this.mapElement));
		}
	}

	// Removes all highlights from the map.
    clearMap(){
        for (const layerElement of this.coverageLayer){
			this.mapElement.removeLayer(layerElement);
		}
		this.coverageLayer = [];
	}
	
	// Parses the reference of superposed line segment errors which provides the point pairs between which the superposed line segments are.
	// It needs to be an array of formatted strings to display the error nicely, but for the highlighting, the actual geometrical information is needed.
	// See intersections.js, the last lines of the waySelfIntersections()-function, to view how such a string looks.
	parseIntersect3References(selfIntersections){
		let superposedLineSegmentsCoords = [];
		for (const superposedLineSegmentsCoordsString of selfIntersections){
			let startEndStrings = superposedLineSegmentsCoordsString.split("&");
			let splitStartString = startEndStrings[0].split(",");
			let splitEndString = startEndStrings[1].split(",");

			superposedLineSegmentsCoords.push([ [parseFloat(splitStartString[0].slice(1, splitStartString[0].length)), parseFloat(splitStartString[1].slice(1, splitStartString[1].length - 2))],
												[parseFloat(splitEndString[0].slice(2, splitEndString[0].length)), parseFloat(splitEndString[1].slice(1, splitStartString[1].length - 1))] ]);
		}
		return superposedLineSegmentsCoords;
	}
}

export default ErrorHighlighter;
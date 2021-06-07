/*
 * This file is part of OsmInEdit, released under ISC license (see LICENSE.md)
 *
 * Copyright (c) Adrien Pavie 2019
 * Copyright (c) Daimler AG 2019
 *
 * Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 */

import React, { Component } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import 'leaflet-hash';
import { Map, TileLayer, WMSTileLayer, AttributionControl, ScaleControl } from 'react-leaflet';
import { BingLayer } from 'react-leaflet-bing';
import Body from './Body';
import Building from './layers/Building';
import Features from './layers/Features';
import FloorImagery from './layers/FloorImagery';
import I18n from '../config/locales/ui';
import Levels from './layers/Levels';
import LevelSelector from './common/LevelSelector';
import MapStyler from '../model/mapcss/MapStyler';
import NorthPointer from './common/NorthPointer';
import PACKAGE from '../../package.json';
import PubSub from 'pubsub-js';
import SidePanelButton from './common/SidePanelButton';
import Spinner from 'react-bootstrap/Spinner';

import SitObject from './SitObject';
import Coverage from './coverage';
import MultiBuildingAnalyzer from '../ctrl/MultiBuildingAnalyzer'

import {analysisToVisObj} from "./analysisToVisObj";
import ErrorHighlighter from "./ErrorHighlighter";

import * as sitConf from "../ctrl/sitConf";
import { getLevelsAsNumbers } from '../utils_own';

const MAP_MAX_ZOOM = 26;
let buildingColors = [];
let index = 0;

/*
 * Extend leaflet hash for handling level value
 */

L.Hash.parseHash = function(hash) {
	if(hash.indexOf('#') === 0) {
		hash = hash.substr(1);
	}
	var args = hash.split("/");
	if (args.length >= 3 && args.length <= 4) {
		var zoom = parseInt(args[0], 10),
		lat = parseFloat(args[1]),
		lon = parseFloat(args[2]),
		level = args.length === 4 ? parseInt(args[3], 10) : 0;

		if (isNaN(zoom) || isNaN(lat) || isNaN(lon)) {
			return false;
		} else {
			return {
				center: new L.LatLng(lat, lon),
				zoom: zoom,
				level: isNaN(level) ? 0 : level
			};
		}
	} else {
		return false;
	}
};
L.Hash.prototype.parseHash = L.Hash.parseHash;

L.Hash.formatHash = function(map) {
	var center = map.getCenter(),
		zoom = map.getZoom(),
		precision = Math.max(0, Math.ceil(Math.log(zoom) / Math.LN2));

	return "#" + [zoom,
		center.lat.toFixed(precision),
		center.lng.toFixed(precision),
		this._level || "0"
	].join("/");
};
L.Hash.prototype.formatHash = L.Hash.formatHash;

L.Hash.prototype.setLevel = function(lvl) {
	if(this._level !== lvl) {
		this._level = lvl;
		var hash = this.formatHash(this.map);
		window.location.replace(hash);
		this.lastHash = hash;
	}
};

L.Hash.prototype.update = function() {
	var hash = window.location.hash;
	if (hash === this.lastHash) {
		return;
	}
	var parsed = this.parseHash(hash);
	if (parsed) {
		this.movingMap = true;
		this.map.setView(parsed.center, parsed.zoom);
		this.movingMap = false;
		PubSub.publish("body.level.set", { level: parsed.level });
	} else {
		this.onMapMove(this.map);
	}
};


/**
 * Map component handles t.he whole map and associated widgets
 */
class MyMap extends Component {
	constructor() {
		super();

		this.state = {
			loading: false,
			dataready: false,
			multibuilding: true
		};
		this.mapStyler = new MapStyler();
		this.loadedArea = null;
		this.sitAnalyzer = new sitConf.SITAnalyzer();
		this.errorHighlighter = new ErrorHighlighter(this.sitAnalyzer);
		this.BuildingLayer = [];
		this.highlightedError = {id: null, references: null};
	}

	// Triggers highlighting by the ErrorHighlighter for a given error type (errorId) and references of a concrete error instance.
	highlightError= (errorId, references) =>{
		this.highlightedError = {
			id: errorId,
			references: references
		}
		this.errorHighlighter.highlightError(errorId, references);
	}

	// Highlights the areas in a building covered by consistently (SIT- and geometrically) typed features on the current level.
	highlightCovered(){

		this.clearMap();
		
		// Highlight all consistently typed areas of the current level.
		for (const area of this.sitAnalyzer.correctSITTypeObjects.areas){
			let areaLevels = getLevelsAsNumbers(area);
			if (areaLevels !== false && areaLevels !== -1){
				if (areaLevels.includes(this.props.level)){
					this.errorHighlighter.highlightFeature(area);
				}
			}
		}

		// Highlight all consistently typed rooms of the current level.
		for (const room of this.sitAnalyzer.correctSITTypeObjects.rooms){
			let roomLevels = getLevelsAsNumbers(room);
			if (roomLevels !== false && roomLevels !== -1){
				if (roomLevels.includes(this.props.level)){
					this.errorHighlighter.highlightFeature(room);
				}
			}
		}

		// Highlight all consistently typed corridors of the current level.
		for (const corridor of this.sitAnalyzer.correctSITTypeObjects.corridors){
			let corridorLevels = getLevelsAsNumbers(corridor);
			if (corridorLevels !== false && corridorLevels !== -1){
				if (corridorLevels.includes(this.props.level)){
					this.errorHighlighter.highlightFeature(corridor);
				}
			}
		}
	}

	// Removes all highlighting from the map.
	clearMap=()=>{
		this.errorHighlighter.clearMap();
		this.highlightedError = {id: null, references: null};
	}

	// Sets the map level according to how to handle a given error type (errorId) and given references of a concrete error instance.
	// If the this is triggered by an 'onMouseEnter' event, the level should only change when the current level is not relevant to the given error instance (onMouseEnter = true).
	// Otherwise, the level should always change (onMouseEnter = false).
	setLevel(errorId, errorReferences, onMouseEnter){

		// Errors regarding the whole building don't need to change the map level (indication via error type).
		if (!["BUILDINGTAGS-1", "BUILDINGTAGS-2", "BUILDINGTAGS-3", "ENTR-1", "MULTIPOLY-1", "MULTIPOLY-2"].includes(errorId)){
			// Errors regarding the whole building don't need to change the map level (indication via referenced feature).
			if (this.props.buildingId === errorReferences[0]){
				return;
			}
			if (errorReferences.length > 1){
				if (this.props.buildingId === errorReferences[1]){
					return;
				}
			}
			
			let levels = [];

			// These error types provide the relevant levels as a reference.
			if (["DOORNOWALL-1", "MULTILVLDOOR-2", "BUILDING-INTERSECT-2"].includes(errorId)){
				levels = errorReferences[1];
			}
			if (errorId === "LVLOVERLAP-1"){
				levels = errorReferences[2];
			}

			// These error types only have one relevant level, which they provide as a reference.
			else if (["LVLREACH-1"].includes(errorId)){
				levels = [ errorReferences[0] ];
			}
			
			// Potential levels of the error when two buildings overlap are the levels which belong to both buildings.
			else if (errorId === "BUILDING-OVERLAP-1"){
				let buildingLevels = window.vectorDataManager.findFeature(this.props.buildingId).properties.own.levels;
				let comparisonBuildingLevels = window.vectorDataManager.findFeature(errorReferences[0]).properties.own.levels;

				// Aggregate levels of both.
				for (const l of buildingLevels){
					if (comparisonBuildingLevels.includes(l)){
						levels.push(l);
					}
				}
			}

			// For all other error types, the relevant levels are the levels of the features which is erroneous.
			// Those errors reference the feature by its ID as first or second reference.
			else if (["INTERSECT-1", "INTERSECT-2", "INTERSECT-3"].includes(errorId)) {
				levels = window.vectorDataManager.findFeature(errorReferences[1]).properties.own.levels;	
			}

			else {
				levels = window.vectorDataManager.findFeature(errorReferences[0]).properties.own.levels;
			}
				
			// If the current map level is one of the relevant levels, display the next relevant level, if 'onMouseEnter' is false.
			// Otherwise, display the first relevant level.
			let levelToSet;
			if (levels.includes(this.props.level)){
				if (onMouseEnter){
					levelToSet = this.props.level;
				}
				else {
					levelToSet = levels[(levels.indexOf(this.props.level) + 1) % levels.length];
				}
			}
			else {
				levelToSet = levels[0];
			}

			if (this.props.level !== levelToSet){
				PubSub.publishSync("body.level.set", {level: levelToSet});
			}
			// Update current level in ErrorHighlighter.
			this.errorHighlighter.highlightedLevel = levelToSet;
		}
	}
	
	featureCollection(level,feature){
		if(!feature){return false;}
		//When Data is available then get the Data from Cache
		// Update the error highlighter's reference to the map element.
		this.errorHighlighter.mapElement = this.elem.leafletElement;
		if(this.state.dataready){
			
		let building = window.vectorDataManager.findAssociatedBuilding(feature);
	
		let level = building.properties.own.levels;
		let coverage = new Coverage();
	

		
		// Analysis of the current building and propagation of intermediate results to the ErrorHighlighter.
		let analysisResults = analysisToVisObj(this.makeBuildingObject(building), this, this.sitAnalyzer);
		let analysedBuilding = analysisResults.currentBuilding;
		this.errorHighlighter.currentNavigationControl = analysisResults.navigationControl;
		this.errorHighlighter.currentBuildingId = building.id;
		this.props.updateCurrentBuilding(analysedBuilding);

		if(window.vectorDataManager.hasIndoorFeatures(building)){
			//get the FeatureCollection from a level (all ways/nodes etc. on level x)
			let featureCollection = window.vectorDataManager.getFeaturesInLevel(building, level);
	
			return(this.getObject(featureCollection))
		}
		}
		
	}

	makeBuildingObject(building){
		let buildingWithLevels = window.vectorDataManager.getBuildingLevels(building);
		var oneObject= {"building" : buildingWithLevels, "levels" : []}
		buildingWithLevels.properties.own.levels.forEach(function(levelID){
			var features =  window.vectorDataManager.getFeaturesInLevel(buildingWithLevels, levelID)
			var level = {"level" : levelID}
			Object.assign(level,features);
			oneObject.levels.push(level);
		});
		return oneObject;
	}

	getObject(featureCollection){
		
		let objects = [];
		//DEBUG: get the feature of the first item in FeatureCollection
		let features = featureCollection[Object.keys(featureCollection)[1]];
		features.forEach(function(feat){
		//get all properties from the feature
		let properties = feat.properties;
		let id = feat.id;
		let type = properties.type;
		//get all Tags from the feature properties
		let tags = properties.tags;
		let obj = new SitObject(properties, id, type, tags);
		objects.push(obj);		
		});

		
		return objects;
	}

	//Colors multiple Buildings on Zoomlevel 17 and lower according to the color output of MultibuildingAnalyzer.js
	colorBuildings(multiBuilding){

		//color every building which is in the multibuilding object when the Zoomlevel is below 18
		if(multiBuilding.length !== 0 && this.elem.leafletElement.getZoom() < 18 && index < 1){
			this.cleanUp();
			for (let i = 0; i < multiBuilding.length; i++){
				let building = window.vectorDataManager.findFeature(multiBuilding[i].id);
				this.BuildingLayer[i] = L.geoJSON(building, {color : multiBuilding[i].color} ).addTo(this.elem.leafletElement);
			}
			index++;
		}
		//if no multibuilding Object is found remove all colors from the color Layer
		else {
			if(this.elem.leafletElement.getZoom() > 17 && this.BuildingLayer.length !== 0){
				for(let i = 0; i < this.BuildingLayer.length; i++){
					this.elem.leafletElement.removeLayer(this.BuildingLayer[i]);	
				}
				index = 0;
			}
		}
	}

	levelStructure(level,feature){
		var jsonString = this.featureCollection(level,feature);
		if(!jsonString){return false;}
		var doors = [];
		var rooms =[];
		//find all doors
		jsonString.forEach(function(sitObj){
			var tags = sitObj.gettags();
			var door = tags["door"];
			if (!door){
				door = tags["addr:door"]
			}
			if(door){
				doors.push(sitObj);
			}
		});
		//find all areas or rooms and corresponding doors

		jsonString.forEach(function(sitObj){
			
			var tags = sitObj.gettags();
			var indoor = tags["indoor"];

			
			var componentid = [];
			if (indoor==="area" || indoor==="room"){
				doors.forEach(function(door){
					var featureRoom = window.vectorDataManager.findFeature(sitObj.getid());
					var featureDoor = window.vectorDataManager.findFeature(door.getid());
					if (window.vectorDataManager.isOnContour(featureRoom,featureDoor)){
						componentid.push(door.getid());
						//include doors inside boundaries _containsWithBoundary instead of is on contour
					}
				});
				
			}
			if(tags["indoor"]){
			rooms.push([sitObj,componentid]);}
		});
		
		var doorsConnected=[];
		doors.forEach(function(door){
			var roomsForDoor = []
			rooms.forEach(function(room){
				if (room[1].includes(door.getid())){
					roomsForDoor.push(room[0].getid());
				}
			});
			if(roomsForDoor&&roomsForDoor.length){
				doorsConnected.push([door,roomsForDoor]);
			}
		});
		var unconnectedDoors=doors;
		var returnRooms = [];
		var returnDoors = [];
		var returnUnDoors=[];
		rooms.forEach(function(room){
			//format: [type,id,tags,[connected_dors]]
			returnRooms.push({"type" : room[0].gettype(),"id" : room[0].getid(),"tags" : room[0].gettags(),"connected-doors" : room[1]});
		});
		doorsConnected.forEach(function(door){
			//format: [type,id,tags,[connected_areas]]
			returnDoors.push({"type" : door[0].gettype(),"id" : door[0].getid(),"tags" : door[0].gettags(),"connected-areas" : door[1]});
			unconnectedDoors = unconnectedDoors.filter(function(el) { return el !== door[0]; });
		});
		unconnectedDoors.forEach(function(door){
			returnUnDoors.push({"type" : door.gettype(), "id" : door.getid(), "tags" : door.gettags()});
		});
		//todo: add unconnected dors?
		var returnArray={"areas" : returnRooms,"components" : returnDoors};

		//for graph testing
		
		return returnArray;
	}


	/**
	 * Alert this component that its size has changed
	 */
	invalidateSize() {
		if(this.elem && this.elem.leafletElement) {
			this.elem.leafletElement.invalidateSize();
		}
	}

	/**
	 * Clean up map after changeset upload
	 */
	cleanUp() {
		this.loadedArea = null;
		this.setState({ loading: false, dataready: false });
	}

	/**
	 * Get the coordinates of map center
	 * @return {LatLng} Coordinates of map center (or null if not ready)
	 */
	getCenter() {
		return (this.elem && this.elem.leafletElement) ? this.elem.leafletElement.getCenter() : null;
	}

	/**
	 * Get the bounding box of currently shown area on map
	 * @return {LatLngBounds} Bounding box of the map
	 */
	getBounds() {
		return (this.elem && this.elem.leafletElement) ? this.elem.leafletElement.getBounds() : null;
	}

	/**
	 * Is the map currently loading data ?
	 * @return {boolean} True if loading
	 */
	isLoading() {
		return this.state.loading;
	}

	/**
	 * Event handler when map moves
	 * @private
	 */
	async _loadData(bounds) {
		
		if(this.props.datalocked || (window.CONFIG.always_authenticated && !window.editor_user)) {
			return new Promise(resolve => {
				setTimeout(() => resolve(this._loadData(bounds)), 100);
			});
		}
		else if(!this.props.draw && this.getBounds() && this.elem.leafletElement.getZoom() >= (window.CONFIG.data_min_zoom)) {
			let bbox = bounds || this.getBounds();

			// Only load data if bbox is valid and not in an already downloaded area
			if(
				bbox
				&& bbox.getSouth() !== bbox.getNorth()
				&& bbox.getWest() !== bbox.getEast()
				&& (!this.loadedArea || !this.loadedArea.contains(bbox))
			) {
				// Augment bbox size if too small (to avoid many data reloads)
				while(bbox.getSouthWest().distanceTo(bbox.getNorthEast()) < 400) {
					bbox = bbox.pad(0.1);
				}

				this.loadedArea = bbox;
				this.setState(
					{ loading: true },
					async () => {
						try {
							const result = await window.vectorDataManager.loadOSMData(bbox);
							if(this.elem.leafletElement.getZoom() < 18){
								let multiBuilding = new MultiBuildingAnalyzer(this);
								multiBuilding.analyzeBuildingStack();
									if(!isNaN(multiBuilding.globalPercentages.coverage)){
									this.props.updateGlobalPercentages(multiBuilding.globalPercentages)
									}
									buildingColors = multiBuilding.semanticBuildingColors;
									this.colorBuildings(buildingColors);
									this.setState({ loading: false, dataready: false });
							}
							else {this.setState({ loading: false, dataready: result });}
						}
						catch(e) {
							alert(I18n.t("Can't download data from OSM server. Please retry later."));
							this.setState({ loading: false, dataready: false });
						}
					}
				);
			}

		}
		if (!this.props.multibuilding){
			this._analyzeMultiBuildings();
		}
		else{
			this.props.updateGlobalPercentages({"coverage": 0,"conformity": 0,"accessibility":0, "navigability":0});
		}
	}


	/**
	 * Analyze multiple buildings for their SIT
	 * @private
	 */
	_analyzeMultiBuildings(){
		let multiBuilding = new MultiBuildingAnalyzer(this);
		multiBuilding.analyzeBuildingStack();
		if(!isNaN(multiBuilding.globalPercentages.coverage)){
			  this.props.updateGlobalPercentages(multiBuilding.globalPercentages);
		}
	}

	/**
	 * Generate layer from given configuration
	 * @private
	 */
	_getLayer(l, opacity) {
		if(!l || !l.properties || !l.properties.url) {
			return null;
		}

		if(l.properties.type === "tms") {
			const url = l.properties.url
				.replace(/\{zoom\}/g, "{z}")
				.replace(/\{switch:.+?\}/g, "{s}")
				.replace(/\{-y\}/g, "{y}");

			return <TileLayer
				attribution={l.properties.attribution ? '<a href="'+l.properties.attribution.url+'" target="_blank">'+l.properties.attribution.text+'</a>' : ''}
				url={url}
				key={url}
				minZoom={l.properties.min_zoom}
				maxNativeZoom={l.properties.max_zoom}
				maxZoom={MAP_MAX_ZOOM}
				opacity={opacity}
				tms={l.properties.url.indexOf("{-y}") > 0}
			/>;
		}
		else if(l.properties.type === "wms") {
			let url = l.properties.url;
			const params = {};
			const urlParts = l.properties.url.split('?');

			if(urlParts.length > 1) {
				url = urlParts[0];
				const blacklist = ['srs', 'width', 'height', 'format', 'service', 'request', 'bbox', 'key'];

				urlParts[1].split('&').forEach(p => {
					const [k,v] = p.split('=');
					if(!blacklist.includes(k.toLowerCase())) {
						params[k.toLowerCase()] = v;
					}
					else if(k.toLowerCase() === 'key') {
						params.KEY = v;
					}
				});
			}

			return <WMSTileLayer
				attribution={l.properties.attribution ? '<a href="'+l.properties.attribution.url+'" target="_blank">'+l.properties.attribution.text+'</a>' : ''}
				url={url}
				key={l.properties.url}
				opacity={opacity}
				{...params}
			/>;
		}
		else if(l.properties.type === "bing" && window.CONFIG.providers && window.CONFIG.providers.bing) {
			return <BingLayer
				bingkey={window.CONFIG.providers.bing}
				type="Aerial"
				maxNativeZoom={20}
				maxZoom={MAP_MAX_ZOOM}
			/>;
		}
		else {
			return null;
		}
	}

	/**
	 * Converts floor imagery info into a Leaflet layer.
	 * @private
	 */
	_getFloorMapLayer(floormap) {
		if(!floormap || !floormap.topleft) {
			return null;
		}
		else {
			return <FloorImagery
				data={floormap}
				key={floormap.id}
				opacity={floormap.opacity !== undefined && !isNaN(parseFloat(floormap.opacity)) ? floormap.opacity : 1}
				ref={"floormap_"+floormap.id}
				level={this.props.level}
				mode={this.props.mode}
				tool={this.props.floorImageryMode}
			/>;
		}
	}

	render() {
		const floorImgs = window.imageryManager.getFloorImages();
		let levelsList = null;

		if(this.props.mode === Body.MODE_EXPLORE) {
			levelsList = window.vectorDataManager.getAllLevels(true);
		}
		else if(this.props.mode === Body.MODE_BUILDING) {
			if(this.props.building) {
				levelsList = this.props.building.properties.own.levels.slice(0);
				levelsList.sort();
			}
			else {
				levelsList = window.vectorDataManager.getAllLevels(false);
			}
		}
		else if([ Body.MODE_LEVELS, Body.MODE_FEATURES ].includes(this.props.mode) && this.props.building) {
			levelsList = this.props.building.properties.own.levels.slice(0);
			levelsList.sort();
		}

		
		return <div className="app-map-container">
			{(this.props.mode === Body.MODE_CHANGESET || this.state.loading) && false &&
				<div style={{	
					zIndex: 20000,
					background: "rgba(0,0,0,0.5)",
					position: "absolute",
					top: 0, right: 0, left: 0, bottom: 0,
					textAlign: "center", display: "flex", alignItems: "center"
				}}>
					{this.state.loading &&
						<Spinner
							animation="grow"
							variant="light"
							size="lg"
							style={{ margin: "auto", width: "5rem", height: "5rem" }}
						/>
					}
				</div>
			}
			<Map
				maxZoom={MAP_MAX_ZOOM}
				className={"app-map"+(this.props.draw ? " leaflet-clickable" : "")}
				ref={elem => this.elem = elem}
				preferCanvas={false}
				editable={true}
				scrollWheelZoom={true}
				doubleClickZoom={this.props.mode === Body.MODE_EXPLORE}
				attributionControl={false}
				boxSelector={false}
				boxZoom={false}
			>
				<AttributionControl
					prefix={"<a href='https://framagit.org/PanierAvide/osminedit' target='_blank'>"+window.EDITOR_NAME+"</a> v"+PACKAGE.version+" "+(window.CONFIG.hash === "GIT_HASH" ? "dev" : window.CONFIG.hash)}
				/>

				<ScaleControl
					position="bottomleft"
					imperial={false}
				/>

				<NorthPointer
					position="bottomright"
				/>

				<SidePanelButton
					position="topright"
				/>

				{[Body.MODE_EXPLORE, Body.MODE_BUILDING, Body.MODE_LEVELS, Body.MODE_FEATURES].includes(this.props.mode) && !this.state.loading && this.state.dataready && levelsList &&
					<LevelSelector
						position="topright"
						levels={levelsList}
						level={this.props.level}
					/>
				}

				{this.props.selectedBaseImagery && this._getLayer(this.props.selectedBaseImagery, this.props.baseImageryOpacity)}

				{this.props.selectedOverlaysImagery && this.props.selectedOverlaysImagery.map(ol => this._getLayer(ol, this.props.overlaysImageryOpacity))}

				{this.props.mode !== Body.MODE_EXPLORE && floorImgs && floorImgs.map(fi => this._getFloorMapLayer(fi))}

				{!this.state.loading && this.state.dataready && [Body.MODE_BUILDING, Body.MODE_FLOOR_IMAGERY].includes(this.props.mode) &&
					<Building
						styler={this.mapStyler}
						building={this.props.building}
						draw={this.props.draw}
						level={this.props.level}
						locked={this.props.mode === Body.MODE_FLOOR_IMAGERY}
					/>
				}

				{!this.state.loading && this.state.dataready && this.props.mode === Body.MODE_LEVELS && this.props.building &&
					<Levels
						styler={this.mapStyler}
						level={this.props.level}
						building={this.props.building}
						floor={this.props.floor}
						draw={this.props.draw}
					/>
				}

				{!this.state.loading && this.state.dataready && (this.props.mode === Body.MODE_EXPLORE || (this.props.mode === Body.MODE_FEATURES && this.props.building)) &&
					<Features
						styler={this.mapStyler}
						level={this.props.level}
						building={this.props.building}
						feature={this.props.feature}
						draw={this.props.draw}
						locked={this.props.mode === Body.MODE_EXPLORE}
					/>
				}
			</Map>
		</div>;
	}

	/**
	 * @private
	 */
	_followMouse(e) {
		this._mouseCoords = e.latlng;
	}

	componentDidMount() {
		setTimeout(() => {
			this.invalidateSize();
			this._loadData();
		}, 500);

		// URL hash for map
		this._mapHash = new L.Hash(this.elem.leafletElement);

		// If no valid hash found, use default coordinates from config file or stored cookie
		if(!window.location.hash || !window.location.hash.match(/^#\d+\/-?\d+(.\d+)?\/-?\d+(.\d+)?(\/(-?\d+(.\d+)?)?)?$/)) {
			// Has cookie ?
			const cookieHash = document.cookie.replace(/(?:(?:^|.*;\s*)lasthash\s*=\s*([^;]*).*$)|^.*$/, "$1");
			let newHash;

			if(cookieHash && L.Hash.parseHash(cookieHash)) {
				newHash = cookieHash;
			}
			else {
				newHash = "#"+window.CONFIG.map_initial_zoom+"/"+window.CONFIG.map_initial_latlng.join("/");
			}

			window.history.pushState({}, "", window.location.href.split("#")[0] + newHash);
		}

		L.DomEvent.addListener(window, "hashchange", () => {
			document.cookie = "lasthash="+window.location.hash;
		});

		this.elem.leafletElement.on("dblclick", e => {
			if(!this.props.draw && this.props.mode !== Body.MODE_EXPLORE) {
				PubSub.publish("body.unselect.feature");
			}
		});

		this.elem.leafletElement.on("zoomend moveend", () => {
			if(this.elem && this.elem.leafletElement) {
				this._loadData();

				const zoom = this.elem.leafletElement.getZoom();

				if(zoom < (window.CONFIG.data_min_zoom) && (!this._lastZoom || this._lastZoom >= (window.CONFIG.data_min_zoom))) {
					this.elem.container.classList.add("app-map-novector");
					PubSub.publishSync("body.unselect.feature");
// 					PubSub.publish("body.mode.set", { mode: Body.MODE_BUILDING });
				}
				else if(zoom >= (window.CONFIG.data_min_zoom) && (!this._lastZoom || this._lastZoom < (window.CONFIG.data_min_zoom))) {
					this.elem.container.classList.remove("app-map-novector");
				}

				this._lastZoom = zoom;
			}
		});

		// Follow mouse position
		this.elem.leafletElement.on("mousemove", this._followMouse, this);

		/**
		 * Event for map zoom changes
		 * @event map.zoom.changed
		 * @memberof MyMap
		 * @property {int} zoom The new zoom level
		 */
		const alertZoom = () => {
			if(this.elem && this.elem.leafletElement) {
				PubSub.publish("map.zoom.changed", { zoom: this.elem.leafletElement.getZoom() });
				this.colorBuildings(buildingColors);
			}
		};
		this.elem.leafletElement.on("zoomend", alertZoom);
		alertZoom();

		/**
		 * Event for changing current map position
		 * @event map.position.set
		 * @memberof MyMap
		 * @property {LatLng} coordinates The new position
		 * @property {int} [zoom] The zoom level
		 */
		PubSub.subscribe("map.position.set", (msg, data) => {
			if(data.bbox) {
				const [minlat, maxlat, minlon, maxlon] = data.bbox;
				this.elem.leafletElement.fitBounds([[minlat, minlon], [maxlat, maxlon]]);
			}
			else if(data.zoom) {
				this.elem.leafletElement.setView(data.coordinates, data.zoom);
			}
			else {
				this.elem.leafletElement.panTo(data.coordinates);
			}
		});

		// Event for changing current map level through error highlighting.
		// Parameters are described in the comments for setLevel().
		PubSub.subscribe("map.level.set", (msg, data) => {
			this.setLevel(data.id, data.references, data.onMouseEnter);
		});

		// Event for highlighting an error of the type of the given ID and 
		// the given references of the concrete error instance.		
		PubSub.subscribe("map.highlightError", (msg, data) => {
			this.highlightError(data.id, data.references);
		})

		// Event for highlighting consistently SIT-typed areas on the current level. 
		PubSub.subscribe("map.highlightCovered", (msg, data) => {
			this.highlightCovered();
		})

		// Event for removing all highlighting from the map.
		PubSub.subscribe("map.clearMap", (msg, data) => {
			this.clearMap();
		})
	}

	componentDidUpdate(fromProps) {
		if(this.props.level !== fromProps.level) {
			this._mapHash.setLevel(this.props.level);
		}

		const floorImgs = window.imageryManager.getFloorImages();

		// Force update of floor imagery after mode change
		if(fromProps.mode !== this.props.mode) {
			this.invalidateSize();

			floorImgs.forEach(img => {
				// Check if we have a leaflet layer
				if(this.refs["floormap_"+img.id]) {
					this.refs["floormap_"+img.id].forceUpdate();
				}
			});
		}

		// Follow mouse position
		this.elem.leafletElement.off("mousemove", this._followMouse, this);
		this.elem.leafletElement.on("mousemove", this._followMouse, this);

		// Draw level highlighting againg after level updates if an error to highlight exists, because highlighting will be deleted on level changes.
		if (fromProps.level !== this.props.level && this.highlightedError.id !== null){
			this.highlightError(this.highlightedError.id, this.highlightedError.references);
		}

		// Load wider area if necessary
		if(!this.props.draw && !this.state.loading && this.elem.leafletElement.getZoom() > 19) {

      // This causes errors because its called repeatedly when calling setState in Body.js
			//this._loadData(this.getBounds().pad(0.5*(this.elem.leafletElement.getZoom()-19)));
		}
	}

	componentWillUnmount() {
		PubSub.unsubscribe("map");
		this.elem.leafletElement.off("mousemove", this._followMouse, this);
		this.elem.leafletElement.off("load");
		this.elem.leafletElement.off("zoomend");
		this.elem.leafletElement.off("moveend");
		this.elem.leafletElement.off("dblclick");
	}
}
export default MyMap;

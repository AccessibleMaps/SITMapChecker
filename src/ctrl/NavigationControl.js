import SitObject from '../view/SitObject';
import graphlib from '@dagrejs/graphlib';
import intersection from 'lodash/intersection'
const { Component } = require("react");
var _ = require("lodash");

class NavigationControl extends Component{
	/**
	 * Constructor
	 * @param {MyMap} map the map of OSMinEdit. 
	 * @param {Object} building the building for which to check the navigation
	 * @param {Object} sitConformFeatures the SitConform featrures 
	 */
	constructor(map, building, sitConformFeatures){
		super();
		//give this class the map, to access its functions (makeBuildingObjects)
		this.map = map;
		this.building = building;
		this.navigation(sitConformFeatures);
	}
	

	/**
	 * Start the building analysis based on sitConformFeatures.
	 * @param {object} sitConformFeatures features checked for SIT conformity.
	 */
	navigation(sitConformFeatures){
		// construct the building object;
		var buildingObject = this.cleanBuildingObj(this.building,sitConformFeatures);
		var levelsWithStructure = [];
		var that=this;
		//for each level of the building build the levelstructure with information about connections
        buildingObject.levels.forEach(function(level){
			var features = level.features;
			//get the SitObjects for every level
			var objects = that.getObjects(features);
			//get the levelstructure from the SIT objects and push them
            levelsWithStructure.push({"level" : level.level, "structure" : that.levelStructure(objects)}); 
		});

		
		this.graph=this.buildGraph(levelsWithStructure);
		this.structuredLevel = levelsWithStructure;
		this.buildRoomList();
	}
	
	/**
	 * Cleans the buildingObject of all not SIT conform features.
	 * @param {Object} raw building object with all features.
	 * @param {Object} sitConformFeatures object with sitConformFeatures
	 */
	cleanBuildingObj(raw, sitConformFeatures){
		//checks if the objects in a level also exist in the arrays checked for SIT and geometry in the sitAnalyzer. uses not the most efficient intersection. could be made more efficient
		var featurearray = sitConformFeatures.areas.concat(sitConformFeatures.corridors.concat(sitConformFeatures.doors.concat(sitConformFeatures.rooms)));
		for (var level of raw.levels){
			var tempFeatures = level.features;
			level.features = _.intersection(tempFeatures,featurearray);
		}
		return raw;
	}

	/**
	 * Creates the SitObjets from a featurelist.
	 * @param {Object} features the featurelist.
	 * @return {Array} Array of SitObjects.
	 */
	getObjects(features){
		var objects = [];
		features.forEach(function(feature){
			//create the SitObject with informations from the feature
			objects.push(new SitObject(feature.properties,feature.id,feature.type, feature.properties.tags, feature.geometry));
		});
		return objects;
	}


	/**
	 * check if the room with "id" at "level" is reachable
	 * @param {String} id of the room in question.
	 * @param {Number} level the level of the room, where its reachability should be checked.
	 * @return {Boolean} boolean if the room is reachable.
	 */
	isReachableRoom(id,level){

		//get the components of the building graph
		var components = this.components;

		//check for each component if "outside" and the room are both in this component. If yes, that means the room is reachable, if not, it means not reachable
		for (const comp of components){
			if(comp.includes(id+"_"+level)){
				if(comp.includes('outside')){
					return true;
				}
			}
		}

		return false;
	}


	/**
	 * Checks if a level is reachable.
	 * @param {Number} level the level which should be checked.
	 * @return {Boolean} boolean if level is reachable.
	 */
	isReachableLevel(level){
		var levelFlag = false;

		//build the regex for matching if the string ends with _level, where level is an integer
		var regex= new RegExp("_"+level+"$")

		//get componetns of levelgraph
		var components = this.components;
		for (const comp of components){
			//check for the component of the level graph, which contains "outside", if it also has a node, wich ends with the level. if true, the level is reachable
			if(comp.includes('outside')){
				for (const obj of comp){
					if(regex.test(obj)){
						levelFlag = true;
						break;
					}
				}
			}
		}
		return levelFlag;
	}

	/**
	 * Checks share of reachable rooms (not area).
	 * @return {Number} share of reachable rooms mapped on scale 0 to 1.
	 */
	reachablePercent(){

		//get components of levelgraph
		var components = this.components;
		var reachable =0;
		var unreachable=0;
		for (const comp of components){
			//all nodes in component with "outside" are reachable, add length of this component minus the outside node
			if(comp.includes('outside')){
				reachable += comp.length -1;
			}
			else{
				//all nodes in components not with "outside" are not reachable. Add length of those
				unreachable += comp.length;
			}
		}
		if(unreachable+reachable===0){
			return 1;
		}
		//calculate reachable portion
		return reachable/(unreachable+reachable);
	}

	/**
	 *  Checks which portion of level is reachable. Combines isReachableLevel and reachablePercent.
	 * @param {Number} level the level to check.
	 * @return {Number} portion of level reachable.
	 */
	reachablePercentPerLevel(level){
		var regex= new RegExp("_"+level+"$")
		var components =this.components;
		var reachable = 0;
		var unreachable = 0;
		for (const comp of components){
			if(comp.includes('outside')){
				for (const obj of comp){
					if(regex.test(obj)){
						reachable++;
					}
				}
			}
			else{
				for (const obj of comp){
					if(regex.test(obj)){
						unreachable++;
					}
				}
			}
		}
		if(reachable+unreachable===0){
			return 1;
		}
		return reachable/(unreachable+reachable);
	}

	/**
	 * Checks reachable portion of current level of the map.
	 * @return {Number} reachable portion of current level.
	 */
	currentLvlReachablePercent(){
		return this.reachablePercentPerLevel(this.map.props.level);
	}

	/**
	 * Checks percent of how many levels are reachable.
	 * @return {Number} portion of reachable levels.
	 */
	reachableLevelsPercent(){
		var reach = 0;
		var notreach = 0;
		for (var i = 0;i<this.structuredLevel.length;i++){
			var level = this.structuredLevel[i];
			if (this.isReachableLevel(level.level)){
				reach++;
			}
			else{
				notreach++;
			}
		}	
		if(reach+notreach===0){
			return 1;
		}
		return reach/(reach+notreach);
	
	}

	/**
	 * Checks if a room has a door.
	 * @param {Object} room the room of the level with structure to check.
	 * @return {Boolean} boolean if room has a door.
	 */
	checkForDoor(room){
		if(room.connectedDoors.length>0||room.tags.indoor !== "room"){
			return true
		}
		else{return false}
	}

	/**
	 * Checks for the portion of rooms with a door.
	 * @return {Number} portion of the rooms which have a door.
	 */
	roomsWithDoorsPercent(){
		var rooms = this.getRoomList();
		var roomCount = 0;
		var roomsWithDoorCount = 0;
		for (const r of rooms){
			roomCount++;
			if (r.hasdoor){
				roomsWithDoorCount++;
			}
		}
		if (roomCount===0){
			return 1;
		}
		return roomsWithDoorCount / roomCount;
	}

	/**
	 * Checks if the building has an entrance
	 * @return {Boolean} boolean if the building has an Entrance.
	 */
	checkBuildingEntrance(){

		//get the components of the building graph
		var components = this.components;

		//check for each component if "outside" and the room are both in this component. If yes, that means the room is reachable, if not, it means not reachable
		for (const comp of components){
			if(comp.includes('outside')){
					return true;
			}
		}
		return false
	}

	/**
	 * Builds list of all rooms, with properties, tags and flag if the room has a door and if it is reachable from outside.
	 * This list is saved as property of the NavigationControl Object.
	 */
	buildRoomList(){
		var rooms = []
		for (var i = 0;i<this.structuredLevel.length;i++){
			var level = this.structuredLevel[i];
			for (var j = 0;j<level.structure.areas.length;j++){
				var area = level.structure.areas[j];
			rooms.push({"id" : area.id, "geometry" : area.geometry,"properties" : area.properties, "tags" : area.tags, "hasdoor" : this.checkForDoor(area), "outsidereachable" : this.isReachableRoom(area.id,level.level), "level": level.level});
			}
		}
		this.roomlist = rooms;
	}

	/**
	 * This returns an array with all rooms of the building. Each element is one room object with structure of {id: id, geometry:{geometrydata},properties:{propertydata},tags:{tagdata},hasdoor: flag if room has a door(true/false), outsidereachable: flag if room is reachable from outside (true/false)}.
	 * This list is taken from the property build in buildRoomList(). 
	 */
	getRoomList(){
		return this.roomlist;
	}

	/**
	 * Build a graph, which represents the building. Each node is a room/area, each edge is a connection between those e.g. by a door.
	 * @param {Object} levelsWithStructure the level with it's structure build by this Class.
	 * @return {Graph} The graph.
	 */
	buildGraph(levelsWithStructure){
		var Graph = require("@dagrejs/graphlib").Graph;

		// Create a new graph
		var g = new Graph();
		//create the outside node
		g.setNode('outside', 'this node marks outsides');

		levelsWithStructure.forEach(function(level){
			//create a node for each area/room, named after id+_level and give the room/area object as description
			level.structure.areas.forEach(function(area){
				g.setNode(area.id + "_" + level.level,area)
			});

			level.structure.components.forEach(function(door){
				var startArea;

				//add an edge between a room and outside, if room has an outside door
				if(door.tags.entrance){ 
					door.connectedAreas.forEach(function(area,index){
					
						
						g.setEdge('outside',area+"_"+level.level);
					});
				}
				//add an edge between a room, and all it connected rooms, which are connected by one door (typically two rooms are connected by one or many doors)
				else door.connectedAreas.forEach(function(area,index){
					
					if(index===0){
						startArea=area+"_"+level.level;
					}
					else{
					g.setEdge(startArea,area+"_"+level.level);
					}
				});
			
			});
			for (var fakeDoor of level.structure.fakeDoors){
				g.setEdge(fakeDoor.a + "_" + level.level,fakeDoor.b+"_"+level.level);
			}
		});

		//make connections between levels through stairs etc.
		var connectors = [];
		var connectorObjects = [];
		levelsWithStructure.forEach(function(level){
			level.structure.areas.forEach(function(area){
				//check if level tag is not just a single digit and exists. This means it is a room/area over different levels. Then check if it is a connector, and if so add it to respective lists
				if(!/(?<!\S)\d(?!\S)/.test(area.tags.level)&&area.tags.level&&(area.tags.stairs||area.tags.highway==="elevator"||area.tags.ramp)){ 
					if(!connectors.includes(area.id)){
						connectors.push(area.id);
						connectorObjects.push(area);
					}
				}
			});
		});

		//add  edges for connectors on different levels
		for (const connector of connectorObjects){
			var levelStr = connector.tags.level 
			//check for repeat on
			if(connector.tags.repeat_on&&!connector.tags.level){
				levelStr=connector.tags.repeat_on;
			}

			//check numbering against regex, to add respective edges

			if(/\d-\d/.test(levelStr)){ //Format: 1-4
				//TODO: formatting of -1-3 / -4--1, these are not supported by osminedit
				if (isNaN(levelStr.charAt(0))){
					continue;
				}
				for(var i = parseInt(levelStr.charAt(0));i< parseInt(levelStr.substr(-1)); i++){
					g.setEdge(connector.id+"_"+i,connector.id+"_"+(i+1));
				}

			}
			else if(/;/.test(levelStr)){ //Format 1;2;3;4
				var levels = levelStr.split(';').map(x=>+x);
				for(var j = 0;j<levels.length-1;j++){
					g.setEdge(connector.id+"_"+levels[j],connector.id+"_"+levels[j+1]);
				}
				
			}
		}
		//set components
		this.components = graphlib.alg.components(g);
		//return the graph
	return g;
	}

	/**
	 * Build the level structure in terms of areas (areas/rooms/corridors) and doors. Each room gets the info which doors it has, each door the info which rooms are connected to it.
	 * @param {Array} objects SitObjects of an level.
	 * @return {Array} an array with an Object of structure {"areas" : areas with their infos, "components" : doors with their infos}
	 */
    levelStructure(objects){
		//var objects = this.map.featureCollection(level,feature);
		if(!objects){return false;}
		var doors = [];
		var rooms =[];
		//gets all areas/corridors connected not by  a door added.
		var fakeDoors = new Set;
		//find all doors
		objects.forEach(function(sitObj){
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

		objects.forEach(function(sitObj){
			
			var tags = sitObj.gettags();
			var indoor = tags["indoor"];

			
			var componentid = [];
			
			//check if object is category area etc. and if level or repeat on tag exists
			if ((indoor==="area" || indoor==="room" || indoor==="corridor")&&(tags.level||tags.repeat_on)){
				//get id of room
				var featureRoom = window.vectorDataManager.findFeature(sitObj.getid());

				doors.forEach(function(door){
					//get id of door
					var featureDoor = window.vectorDataManager.findFeature(door.getid());
					
					//check if door is on contour of a room, if yes, add to list of doors for the room
					if (window.vectorDataManager.isOnContour(featureRoom,featureDoor)|| window.vectorDataManager.containsWithBoundary(featureRoom,featureDoor)){
						componentid.push(door.getid());
					}
				});

				//adds walls areas/corridors not connected by doors to the fakeDoors list, so it can be used in the graph later
				if(indoor==="area" || indoor ==="corridor"){
					for (var obj of objects){
						if (!(obj.gettags()["indoor"]==="room")&&!(obj.gettags()["door"])&&obj.getid()!==sitObj.getid()&&window.vectorDataManager.isOverlapping(featureRoom,window.vectorDataManager.findFeature(obj.getid())))
						{
							if(!(fakeDoors.has({"a":obj.getid(),"b":sitObj.getid()}))){
								fakeDoors.add({"a": sitObj.getid(), "b": obj.getid()})
							}
						}
					}
				}
				
			}
			if(tags["indoor"]){
			rooms.push([sitObj,componentid]);}
		});
		var doorsConnected=[];
		//build up array of doors, which connect rooms. Save the rooms accordingly
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
		//build the list of rooms and their respective doors
		rooms.forEach(function(room){
			//format: [type,id,tags,[connected_dors]]
			returnRooms.push({"type" : room[0].gettype(),"id" : room[0].getid(),"geometry" : room[0].getGeometry(),"properties" : room[0].getproperties(),"tags" : room[0].gettags(),"connectedDoors" : room[1]});
		});
		//build the list of doors and their respective rooms (double list)
		doorsConnected.forEach(function(door){
			//format: [type,id,tags,[connected_areas]]
			returnDoors.push({"type" : door[0].gettype(),"id" : door[0].getid(),"geometry" : door[0].getGeometry(),"properties" : door[0].getproperties(),"tags" : door[0].gettags(),"connectedAreas" : door[1]});
			unconnectedDoors = unconnectedDoors.filter(function(el) { return el !== door[0]; });
		});
		//build list of unconnected doors. Not used right now.
		unconnectedDoors.forEach(function(door){
			returnUnDoors.push({"type" : door.gettype(), "id" : door.getid(), "tags" : door.gettags()});
		});
		//build return array
		var returnArray={"areas" : returnRooms,"components" : returnDoors, "fakeDoors" : fakeDoors};
		return returnArray;
	}
}

export default NavigationControl;
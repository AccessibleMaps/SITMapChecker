import 'leaflet/dist/leaflet.css';
import 'leaflet-hash';


class SitObject {
	constructor(properties, id, type, tags, geometry) {
		//super();

        this.properties = properties;
        this.id = id;
        this.type = type;
        this.tags = tags;
        this.geometry = geometry;
    }

    getproperties(){
        return this.properties;
    }

    getid(){
        return this.id;
    }

    gettype(){
        return this.type;
    }

    gettags(){
        return this.tags;
    }

    getGeometry(){
        return this.geometry;
    }


}
export default SitObject;
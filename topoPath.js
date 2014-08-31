//gloabal constants
var boulder = new google.maps.LatLng( 40.01591464708541, -105.27925729751587 );
var meters2feet = 3.28084;


// ---------------- TOPOPOINT ------------------
// topoPoint is the basic unit of elevation data used by topoPath

// topoPoint constuctor
var TopoPoint = function(lat,lng){
	this.lat=lat;
	this.lng=lng;
	this.location={lat:this.lat, lng:this.lng}
	// Data that will be set by the prototype method 'init':
	this.gElev = undefined;
	this.NEDElev = undefined;
}


// Error callback for getCurrentLocationAndAltitude
TopoPoint.prototype.handleGeoLocationError = function(error) {
	this.usePosition(boulder);

    switch(error.code) {
        case error.PERMISSION_DENIED:
            alert("You denied the request for geolocation.  If you want to allow geolocation try clicking the target at the right side of your adress bar.  In the meantime, we will start you off in Boulder, CO.")
            break;
        case error.POSITION_UNAVAILABLE:
            console.log("Location information is unavailable. \nCentering map at the default location");
            break;
        case error.TIMEOUT:
            console.log("The request to get user location timed out. \nCentering map at the default location.");
            break;
        case error.UNKNOWN_ERROR:
            console.log("An unknown getCurrentPosition error occurred. \nCentering map at the default location.");
            break;
    }
}

// Set lat/lng, then call getElevations(argCallback). Accepts any object with coord.latitude/longitude, or k/B, or lat/lng as properties. 
TopoPoint.prototype.usePosition = function(position, argCallback){
	// This is the type of object returned by navigator.geolocation.getCurrentPosition
	if(position.coords){
		var lat = position.coords.latitude;
	  	var lng = position.coords.longitude;
	}
	// This type is returned my google maps
	else if(position instanceof google.maps.LatLng){
		var lat = position.k;
		var lng = position.B;
	}
	// This would be if a lat/lng literal was passed in
	else{
		var lat = position.lat;
		var lng = position.lng;
	}
	// Set the values on the topoPoint
	this.lat = lat;
	this.lng = lng;
	this.getElevation(argCallback);
}

// Get elevation by posting request to USGS Elevation Point Query Service:
TopoPoint.prototype.getNEDElev=function(argCallback){
	var self = this;
	if(argCallback){ var boundCallback = argCallback.bind(this); }
	$.post('/getNED',{lat:this.lat,lng:this.lng},function(NEDElevationResponse,status){
		self.NEDElev = NEDElevationResponse.elevation;
		if(boundCallback) boundCallback(NEDElevationResponse,status);		
	})
}

// Callback for request to google elevation service
TopoPoint.prototype.useGElev = function(gElevResult, status){
	if(status == google.maps.ElevationStatus.OK) this.gElev = meters2feet*gElevResult[0].elevation; 
	else handleGElevError(status);
}

// Get elevation using google maps api, then apply callback on success:
TopoPoint.prototype.getGElev = function(argCallback){
	var location = new google.maps.LatLng(this.lat,this.lng);
	var GElevCallback = this.useGElev.bind(this);
	if(argCallback){ var boundCallback = argCallback.bind(this); }
	var combinedCallback = function(gElevResult, status){
		GElevCallback(gElevResult,status);
		if(boundCallback){ boundCallback(gElevResult); }
	}
	// Inititate google elevation get request
	var elevator = new google.maps.ElevationService();
	elevator.getElevationForLocations( {'locations':[location]} , combinedCallback )
}

// Error handler for google.maps.ElevationStatus != 'OK'
TopoPoint.prototype.handleGElevError = function(status){
	switch(status){
		case google.maps.ElevationStatus.INVALID_REQUEST:
			console.log("This google.maps elevation request was invalid.");
			break;
		case google.maps.ElevationStatus.REQUEST_DENIED:
			console.log("The webpage is not allowed to use the elevation service for some reason.");
			break;		
		case google.maps.ElevationStatus.UNKNOWN_ERROR:
			console.log("A geocoding, directions or elevation request could not be successfully processed, yet the exact reason for the failure is not known.");
			break;
	}	
}

// Round a latitude or longitude to 6 decimal places for display
TopoPoint.prototype.roundLoc = function(x){ 
	return Math.round(1000000*x)/1000000; 
}

// List the topoPoint's properties
TopoPoint.prototype.toString = function(){
	return 	"Latitude: "+this.roundLoc(this.lat)+
			"\nLongitude: "+this.roundLoc(this.lng)+ 
			"\nUSGS altitude: "+Math.round(this.NEDElev)+" ft"+
			"\nGoogle altitude: "+Math.round(this.gElev)+" ft";
}

// Create the HTML for an infoWindow when the topoPoint is displayed on a map
TopoPoint.prototype.infoWindowContent = function(){
	return 	'<p> Latitude:  '+this.roundLoc(this.lat)
			+'<br> Longitude: '+this.roundLoc(this.lng)
			+'<br> USGS altitude: '+Math.round(this.NEDElev)+' ft'
			+'<br> Google altitude: '+Math.round(this.gElev)+' ft</p>';
}

// Get elevations from NED and google, then apply the argCallback
TopoPoint.prototype.getElevation = function(argCallback){
	var boundGElev = this.getGElev.bind(this);
	if(argCallback){var boundCallback = argCallback.bind(this);}
	this.getNEDElev(function(){
		boundGElev(boundCallback);
	})
}

 // Find user's location if possible (otherwise set default location), then apply argCallback
TopoPoint.prototype.getCurrentLocationAndAltitude = function(argCallback){
	var boundUsePosition = this.usePosition.bind(this);
	if(argCallback) var boundCallback = argCallback.bind(this);
	var navCallback = function(position){
		boundUsePosition(position,boundCallback)	
	}
	if (navigator.geolocation) {
		// call getCurrentPosition, first parameter is the callback to use on success, second parameter is the callback for error 
		var errorHandler = this.handleGeoLocationError.bind(this);
    	navigator.geolocation.getCurrentPosition(navCallback, errorHandler, {enableHighAccuracy:true});
    } 
  	// !navigator.geolocation means the browser doesn't support geolocation, and thus we won't get detailed error information.  This case is handled as follows:
    else {
    	navCallback(boulder);
    	alert("Geolocation is not supported by this browser,<br> so we will start you off in Boulder, CO.");
    }
}








// ----------- TOPOPATH ------------------------------------

// Note 1: A path is an array of locations returned by the direction service. The topopoints also comprise an array of locations, but they are evenly spaced along the path, and are not equal to the 'path' points.
// Note 2: TopoPath.terrain.classifications and also TopoPath.coloredPath currently use gGrades.  Once NEDGrades are improved I will switch to use those.  
var TopoPath = function(googleDirectionResult,map){
	this.route = googleDirectionResult;
	this.distance = meters2feet*googleDirectionResult.routes[0].legs[0].distance.value;
	this.path=googleDirectionResult.routes[0].overview_path;
	this.map = map;
	this.topoPoints = [];
	this.sampleDistance = 0;
	// This gets passed into local storage for the ridingView and demoView to use:
	this.terrain = {NEDGrades:[],gGrades:[],classifications:[],distance:meters2feet*googleDirectionResult.routes[0].legs[0].distance.value};
	this.stats = {maxGrade:0,minGrade:0,distance:0,elevationChange:0,averageGrade:0,totalAscent:0};
	this.coloredPath = [];
}

// Sets the sample distance, the grades as calculated from google and NED, and 
TopoPath.prototype.setTerrain = function(){
	//if(!topoPoints) return console.log("Error: must define topoPoints before calling setTerrain");

	this.sampleDistance = this.distance/(this.topoPoints.length-1);

	for (var i = 0; i < this.topoPoints.length-1; i++) {
		var height = this.topoPoints[i+1].NEDElev-this.topoPoints[i].NEDElev;
		this.terrain.NEDGrades[i]=100*height/this.sampleDistance;
	};

	for (var i = 0; i < this.topoPoints.length-1; i++) {
		var height = this.topoPoints[i+1].gElev-this.topoPoints[i].gElev;
		this.terrain.gGrades[i]=100*height/this.sampleDistance;
	};

	this.terrain.classifications = this.terrain.gGrades.map(function(grade){
		if( grade > 2 ) 		return 'climb';
		else if( grade > -2 ) 	return 'flat';
		else 					return 'descent';
	});
}





// Fills in the global data fields.  
TopoPath.prototype.setStats = function(){

	this.stats.elevationChange = this.topoPoints[this.topoPoints.length-1].NEDElev-this.topoPoints[0].NEDElev;
	this.stats.distance = meters2feet*this.route.routes[0].legs[0].distance.value;
	this.stats.averageGrade = 100*this.stats.elevationChange/this.stats.distance;
	for (var i = 0; i < this.topoPoints.length-1; i++) {
		this.stats.maxGrade = Math.max(this.terrain.NEDGrades[i],this.stats.maxGrade);
		this.stats.minGrade = Math.min(this.terrain.NEDGrades[i],this.stats.minGrade);
		this.stats.totalAscent += Math.max(0,this.topoPoints[i+1].NEDElev - this.topoPoints[i].NEDElev);
	};
}

// Display stats in a map container
TopoPath.prototype.displayStats = function(mapContainerId){
	$(mapContainerId+' .average-grade').val(Math.round(10*averageGrade)/10+'%');
	$(mapContainerId+' .steepest').val(Math.round(10*Math.max(maxGrade,-minGrade))/10+'%');
	$(mapContainerId+' .total-ascent').val(Math.round(3.28084*totalAscent)+' feet');	
}



TopoPath.prototype.unrender = function(){
	this.coloredPath.forEach(function(segment){segment.setMap(null);})
	this.coloredPath = [];
}



TopoPath.prototype.render = function(){
	for (var i = 0; i < this.topoPoints.length-1; i++) {
		var color = getColor(this.terrain.gGrades[i]);
		var polyOptions = {
			strokeColor: color,
			strokeOpacity: 0.8,
			strokeWeight: 4,
			path:[this.topoPoints[i].location,this.topoPoints[i+1].location]
		};
	 	var poly = new google.maps.Polyline(polyOptions);
		poly.setMap(this.map);
		this.coloredPath.push(poly);
	};
}
	

// return an hsl value with hue determined by grade
function getColor(grade){
	// Apmlify the grade, convert it to degrees in range (-pi/2,pi/2), convert to range (0,120)
	var h=60-Math.atan(grade/3)*120/Math.PI;
	return 'hsl('+h+',100%,50%)'
}

// Constructor for UpcomingTerrain objects.   
var UpcomingTerrain = function(topoPath,index){
	var terrain = topoPath.terrain.classifications;
	// should be 'climb', 'flat', or 'descent'
	this.currentTerrainType=terrain[index];
	this.currentGrade=topoPath.terrain.gGrades[index];
	// Find when the next terrain type comes up:
	var nextIndex = terrain.length-1; // end of the route
	for (var i = index+1; i < terrain.length; i++) {
		// check if the next few terrain types don't match the current type
		if( terrain[index] !== terrain[i] &&
			terrain[index] !== terrain[i+1] &&
			terrain[index] !== terrain[i+2] ){
			nextIndex = i;
			break;
		}
	};
	this.indexOfNextTerrainType=nextIndex;
	this.distanceUntilNextTerrainType = topoPath.sampleDistance*(nextIndex-index);
	this.averageGrade = 100*(topoPath.topoPoints[nextIndex].gElev-topoPath.topoPoints[index].gElev)/(topoPath.sampleDistance*(nextIndex-index));

	this.toString = function(){
		console.log("index, nextIndex", index, nextIndex)
		return 'Your current '+this.currentTerrainType+' will continue for '+(meters2miles*this.distanceUntilNextTerrainType/meters2feet).toFixed(1)+'miles <br> at an average grade of '+this.averageGrade.toFixed(1)+'%.';
	};
}


var upcomingTerrainMarker;

function showUpcomingTerrain(rightClick){
	console.log("rightClick: ", rightClick)
	// Step 0: determine if terrain is available, if not alert the user and exit the function:
	if(routingComplete===false){
		return console.log('Please wait a moment for routing to complete')
	}
	// Step 1 Delete the previous marker
	if(upcomingTerrainMarker){ 
		upcomingTerrainMarker.setMap(null); 
		upcomingTerrainMarker=null; 
	}
	// Step 2: Determine click location
	var currentLocation = rightClick.latLng;
	// Step 3: Find closest location on route
    var indexOfClosest = indexOfclosestRoutePoint(currentLocation,topoPath.topoPoints);
	// Step 4: Calculate the upcoming terrain info:
	var upcomingTerrain = new UpcomingTerrain(topoPath,indexOfClosest);
	// Step 5: Add a marker at the closest point:
	upcomingTerrainMarker = new google.maps.Marker({
		    position: topoPath.topoPoints[indexOfClosest].location,
		    map: directionMap,
		    title: 'Current position',
		    draggable:false
	});
	// Step 6: Add the info to an info window, and attach it to the marker: 
	var contentString = upcomingTerrain.toString();
	
	var infowindow = new google.maps.InfoWindow({
	    content: contentString
	});
 	infowindow.open(directionMap,upcomingTerrainMarker);
}
	

function getDistanceFromLatLon(lat1,lon1,lat2,lon2) {
  var R = 6371000; // Radius of the earth in m
  var dLat = deg2rad(lat2-lat1);  
  var dLon = deg2rad(lon2-lon1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c; // Distance in meters
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}

// This function finds which terrain point is closest to a given location.  It uses the haversine formula to calculate distance.
function indexOfclosestRoutePoint(location,locArray){
	var indexOfClosest=0;
	var distance = getDistanceFromLatLon( location.lat(),location.lng() , locArray[0].location.lat,locArray[0].location.lng );
	console.log("distance: ", distance)
	for (var i = 0; i < locArray.length; i++) {
		var d = getDistanceFromLatLon( location.lat(),location.lng() , locArray[i].location.lat,locArray[i].location.lng );
		if( d < distance){
			indexOfClosest=i;
			distance = d;
		}
	};
	return indexOfClosest;
}




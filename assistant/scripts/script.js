var map;  
var directionsDisplay, directionsService;
var geocoder;
var start, end;
var rmarkers = [];
var cmarkers = [];
var infoWindow;

// Access FireBase Data 
//this entire config block can be directly copy from Firebase when you create in your account 
var config = {
  apiKey: "yourkey",  
  authDomain: "yourdomain",
  databaseURL: "yoururl",
  projectId: "yourprojectID",
  storageBucket: "yourstorageBuckey",
  messagingSenderId: "yoursendingId"
};
firebase.initializeApp(config);


//function for fetching data from openweather API
//change appid= "this is for your own ID"
function getTemp(location){
    var apiCall = 'http://api.openweathermap.org/data/2.5/weather?lat='+ location.lat() + '&lon='+ location.lng()
        +'&units=imperial&appid=yourownWeatherApikey';
    var temp_min;
    var temp_max;
    var weather_description;

    return new Promise(function(resolve, reject) {
        $.getJSON(apiCall, weatherCallback);

        function weatherCallback(weatherData){
            resolve([temp_min = weatherData.main.temp_min,
                temp_max = weatherData.main.temp_max,
                weather_description = weatherData.weather[0].description]);
        };
    });
}

// initialize google map 
function initmap() {

    directionsService = new google.maps.DirectionsService;
    directionsDisplay = new google.maps.DirectionsRenderer({suppressMarkers: true});
    geocoder = new google.maps.Geocoder;

    //map setup
    var mapOptions= {
        center: new google.maps.LatLng(42.880230,-78.878738), //buffalo
        zoom:13,
    };
    map = new google.maps.Map(document.getElementById("googleMap"),mapOptions);

    //autofill box
    autoCompleteSetup = function(){
        autostart = new google.maps.places.Autocomplete(document.getElementById('start'));
        autoend = new google.maps.places.Autocomplete(document.getElementById('end')); 
    } 
    autoCompleteSetup();

    //direction information Panel
    directionsDisplay.setMap(map);
    directionsDisplay.setPanel(document.getElementById("routePanel"));
    infoWindow = new google.maps.InfoWindow();

    //adding click event to search button
    document.getElementById("search").addEventListener('click',function() {

        //save user inputvalues
        start = document.getElementById('start').value;
        end = document.getElementById('end').value;

    //search function is the main function to fetch data from api or using database
        search();
    });
}

// main function using google api to create route from user input box
// this will be called when data was not found in database
function calculateRoute(directionsService, directionsDisplay) {

    directionsService.route({
        origin: start,
        destination: end,
        travelMode:'DRIVING'
    }, function(response, status) {
        if(status == 'OK'){

            directionsDisplay.setDirections(response);


            var route = response.routes[0];
            var waypoints = route.legs[0].steps;
            var legs = route.legs;

            //this is used to clean markers created by google api
            Promise.all(rmarkers).then(function(resultVals){
                for (r = 0; r < resultVals.length; r++){
                    resultVals[r].setMap(null);
                }
            });
            rmarkers = [];

            //start to adding marker so they can be used to clear in the future
            startMarker = markerMaker(legs[0].start_location);
            rmarkers.push(startMarker);
  
            for(m = 0; m < waypoints.length; m++){
                rmarkers.push(markerMaker(waypoints[m].end_location));
            }

            //adding information windows to each marker and adding labels for start and end
            Promise.all(rmarkers).then(function(resultVals){
                var len = resultVals.length-1 
                for (i = 0; i < resultVals.length; i++){
                    switch(i){
                        case 0: 
                            resultVals[0].set('point_id', 'start');
                            resultVals[0].setLabel('A');
                            break;
                        case len:
                            resultVals[len].setLabel('B');
                            resultVals[len].set('point_id', 'end');
                            break;
                        default:
                            resultVals[i].set('point_id', "waypoint" + i);
                    }
                    resultVals[i].addListener('click', openInfoWindow);
                    cmarkers.push(resultVals[i]);
                }

                // save data into database
                saveIntoDb(resultVals);
            });         
        }else{
            window.alert('Direction request failed due to ' + status)
        }
    });
}

//create marker as well as fetching and organizing data from google API and weather API 
function markerMaker(location){
    return new Promise(function(resolve,reject){
        getTemp(location).then(function(result){
            var marker;
            resolve(
                marker = new google.maps.Marker({
                map: map,
                position: location,
                temp_min: result[0],
                temp_max: result[1],
                weather_description: result[2]
                })
            );
        });
    });
}


//create information windows for each marker by using data from each marker
function openInfoWindow(){ 
    marker = this;
    var latlng = {lat: this.getPosition().lat(), lng: this.getPosition().lng()};
    var address;

    var promise = new Promise(function(resolve, reject) {
    geocoder.geocode({'location': latlng}, function(results, status) {
        if(status === 'OK') {
            if(results[0]) {
                resolve(address = results[0].formatted_address);
            } else {
                window.alert('No results found');
            }
        } else {
            window.alert('Geocoder failed due to: ' + status);
        }
    });
    });

    promise.then(function(value){
        var contentString = "Coordinates: <br>" + marker.getPosition().toUrlValue(6)+
        "<br>" + value +
        "<br>Temp Min: " + marker.temp_min + "°F" +
        "<br>Temp Max: " + marker.temp_max + "°F" +
        "<br>Weather Description: " + marker.weather_description + ".";
        // var contentString = this.getTitle()+"<br>"+this.getPosition().toUrlValue(6)+"<br>Temp: "+this.temperature+"°F";
        infoWindow.setContent(contentString);
        infoWindow.open(map, marker);
    });
}

//saving route data to databasess
function saveIntoDb(routes){
    var database = firebase.database();
    for(i = 0; i < routes.length; i++){
        var name = routes[i].point_id;
        database.ref().child(start).child(end).child('waypoint'+i).set({
            lat: routes[i].getPosition().lat(),
            lng: routes[i].getPosition().lng(),
            tempmin: routes[i].temp_min,
            tempmax: routes[i].temp_max,
            weatherdescription: routes[i].weather_description
        });
    }
}


//main function to getting data from firebase
function search(){
    var database = firebase.database().ref(start+"/"+end);
    setMapOnAll();

    //callback function to start to find data
    database.once('value',function(snapshot) {
        //check if the data exists in the database
        if(snapshot.hasChildren()){
            var request = {
                origin: start,
                destination: end,
                travelMode: 'DRIVING'
            };
            directionsService.route(request, function(result, status) {
            if (status == 'OK') {
                directionsDisplay.setDirections(result);
                }
            });
            //fetching data and start to create markers
            snapshot.forEach(function(child){
                var marker = new google.maps.Marker({
                map: map,
                position: {lat: child.child('lat').val() , lng: child.child('lng').val()},
                temp_min: child.child('tempmin').val(),
                temp_max: child.child('tempmax').val(),
                weather_description: child.child('weatherdescription').val()     
                });
                marker.addListener('click', dbInfobox);
                cmarkers.push(marker);
            })
        }
        else{
    //if route does not exist in database 
    //call calculateRoute to use google api service to create route on map
            calculateRoute(directionsService, directionsDisplay);
        }
    });
}

//information box for markers created based on the database
function dbInfobox(){
    var contentString = "Coordinates: <br>" + this.getPosition().toUrlValue(6)+
        "<br>Temp Min: " + this.temp_min + "°F" +
        "<br>Temp Max: " + this.temp_max + "°F" +
        "<br>Weather Description: " + this.weather_description + ".";
        infoWindow.setContent(contentString);
        infoWindow.open(map, this);
}

//clear markers on maps
function setMapOnAll() {
   for (var i = 0; i < cmarkers.length; i++) {
        cmarkers[i].setMap(null);
    }
    cmarkers = [];
}
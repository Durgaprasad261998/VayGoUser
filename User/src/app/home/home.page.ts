import { Component, OnDestroy, AfterViewInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonButton, IonSpinner, ToastController, IonInput, IonItem, IonList, IonLabel } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import * as L from 'leaflet';
import { MapsService, DistanceMatrixResponse, PlacePrediction } from '../services/maps.service';
import { ApiService } from '../services/api.service';

interface VehicleOption {
  id: string;
  type: string;
  name: string;
  basePrice: number;
  pricePerKm: number;
  price: number;
  eta: string;
  icon: string;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonButton, IonSpinner, IonInput, IonItem, IonList, IonLabel]
})
export class HomePage implements AfterViewInit, OnDestroy {
  userName = 'Durgaprasad';
  activeTab = 'home';

  // UI States
  viewState: 'searching' | 'selecting' | 'confirming' | 'onTrip' = 'searching';
  isLoading = false;
  selectedVehicle: VehicleOption | null = null;
  pickupLocation = 'My Current Location';
  destinationLocation = '';

  driver: any = null;
  otp: string = '';
  enteredOtp: string = '';
  tripStatus: 'arriving' | 'arrived' | 'started' = 'arriving';
  estimatedArrivalMins: number = 3;
  remainingTripTime: string = '';

  // Search state
  pickupSearchQuery = '';
  destinationSearchQuery = '';
  focusedInput: 'pickup' | 'destination' = 'destination';
  predictions: PlacePrediction[] = [];

  private pickupCoords: { lat: number; lng: number } | null = null;
  private destCoords: { lat: number; lng: number } | null = null;
  private currentCoords: { lat: number; lng: number } | null = null;

  distanceData: DistanceMatrixResponse | null = null;
  private map!: L.Map;
  private userMarker!: L.Marker;
  private watchId: number | null = null;

  vehicleOptions: VehicleOption[] = [
    { id: 'bike', type: 'Bike', name: 'VayGo Bike', basePrice: 20, pricePerKm: 10, price: 0, eta: '', icon: '🏍️' },
    { id: 'auto', type: 'Auto', name: 'VayGo Auto', basePrice: 30, pricePerKm: 15, price: 0, eta: '', icon: '🛺' },
    { id: 'car',  type: 'Car',  name: 'VayGo Sedan', basePrice: 50, pricePerKm: 25, price: 0, eta: '', icon: '🚗' },
  ];

  private routeLine: L.Polyline | null = null;
  private destMarker: L.Marker | null = null;
  private driverMarker: L.Marker | null = null;
  private driverToUserRoute: L.Polyline | null = null;

  constructor(
    private router: Router,
    private mapsService: MapsService,
    private apiService: ApiService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private toastCtrl: ToastController
  ) {
    this.loadUserData();
  }

  private loadUserData() {
    const data = localStorage.getItem('userData');
    if (data) {
      const user = JSON.parse(data);
      this.userName = user.fullName || 'User';
    }
  }

  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  ngAfterViewInit() {
    setTimeout(() => this.initMap(), 300);
  }

  private initMap() {
    const defaultCoords: L.LatLngTuple = [13.0827, 80.2707]; // Chennai

    this.map = L.map('map', {
      center: defaultCoords,
      zoom: 15,
      zoomControl: false,
      attributionControl: false
    });

    // Using Google-style map tiles for a more "Google Maps" feel
    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      attribution: 'Google Maps'
    }).addTo(this.map);

    const userIcon = L.divIcon({
      className: 'user-marker-container',
      html: '<div class="user-marker-dot"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    this.userMarker = L.marker(defaultCoords, { icon: userIcon }).addTo(this.map);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        this.zone.run(() => {
          this.currentCoords = { lat, lng };
          this.map.setView([lat, lng], 15);
          this.userMarker.setLatLng([lat, lng]);
          this.updatePickupAddress(lat, lng);
          this.cdr.detectChanges();
        });
      }, (err) => console.warn('Position error:', err), { enableHighAccuracy: true });

      this.watchId = navigator.geolocation.watchPosition(pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        this.zone.run(() => {
          this.currentCoords = { lat, lng };
          this.userMarker.setLatLng([lat, lng]);
          if (this.viewState === 'searching') {
            this.map.panTo([lat, lng]);
          }
          this.cdr.detectChanges();
        });
      }, (err) => console.warn('Watch error:', err), { enableHighAccuracy: true });
    }

    // Ensure map takes full container size
    setTimeout(() => this.map.invalidateSize(), 500);
  }

  private updatePickupAddress(lat: number, lng: number) {
    this.mapsService.getAddressFromCoords(lat, lng).subscribe({
      next: (address) => {
        this.zone.run(() => {
          this.pickupLocation = address;
          this.pickupSearchQuery = address;
          this.pickupCoords = { lat, lng };
          this.cdr.detectChanges();
        });
      },
      error: (err) => console.error('Geocoding error:', err)
    });
  }

  onSearchInput(event: any, type: 'pickup' | 'destination') {
    this.focusedInput = type;
    const val = event.target.value;
    if (val && val.length > 2) {
      this.mapsService.searchPlaces(val).subscribe(data => {
        this.predictions = data;
      });
    } else {
      this.predictions = [];
    }
  }

  selectPrediction(prediction: PlacePrediction) {
    if (this.focusedInput === 'pickup') {
      this.pickupSearchQuery = prediction.description;
      this.pickupLocation = prediction.description;
      this.mapsService.getPlaceDetails(prediction.placeId).subscribe(details => {
        this.pickupCoords = { lat: details.lat, lng: details.lng };
        this.checkAndCalculate();
      });
    } else {
      this.destinationSearchQuery = prediction.description;
      this.destinationLocation = prediction.description;
      this.mapsService.getPlaceDetails(prediction.placeId).subscribe(details => {
        this.destCoords = { lat: details.lat, lng: details.lng };
        this.checkAndCalculate();
      });
    }
    this.predictions = [];
  }

  private checkAndCalculate() {
    if (this.pickupCoords && this.destCoords) {
      const origin = `${this.pickupCoords.lat},${this.pickupCoords.lng}`;
      this.calculateRide(origin, {
        lat: this.destCoords.lat,
        lng: this.destCoords.lng,
        address: this.destinationLocation
      });
    }
  }

  onWhereToClick() {
    // We don't calculate ride immediately anymore
    // Just toggle an expanded search state if needed, or focus input
    this.destinationSearchQuery = '';
    this.predictions = [];
  }

  calculateRide(origin: string, destination: any) {
    const destString = typeof destination === 'string' ? destination : `${destination.lat},${destination.lng}`;
    const destLabel = typeof destination === 'string' ? destination : destination.address;

    console.log('Calculating ride from:', origin, 'to:', destString);
    this.isLoading = true;
    this.destinationLocation = destLabel;
    this.cdr.detectChanges();

    this.mapsService.getDistanceAndDuration(origin, destString).subscribe({
      next: (data) => {
        console.log('Distance data received:', data);
        this.zone.run(() => {
          this.distanceData = data;
          this.remainingTripTime = data.duration;
          this.updateVehiclePrices(data.distanceValue);
          this.viewState = 'selecting';
          this.selectedVehicle = this.vehicleOptions[0];
          this.isLoading = false;

          // Force map resize check
          setTimeout(() => this.map.invalidateSize(), 100);

          // DRAW ROUTE ON MAP
          if (this.map && this.pickupCoords && this.destCoords) {
            this.drawDestinationRoute();
          }

          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        console.error('Map Error Details:', err);
        this.zone.run(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
          const msg = err.message || JSON.stringify(err);
          alert(`Route Error: ${msg}`);
        });
      }
    });
  }

  updateVehiclePrices(meters: number) {
    const km = meters / 1000;
    // Use .map to create new references for better change detection
    this.vehicleOptions = this.vehicleOptions.map(v => ({
      ...v,
      price: Math.round(v.basePrice + (v.pricePerKm * km)),
      eta: this.distanceData ? this.distanceData.duration : '5 min'
    }));
  }

  selectVehicle(v: VehicleOption) {
    this.selectedVehicle = v;
  }

  confirmBooking() {
    if (!this.selectedVehicle || !this.currentCoords || !this.destCoords) {
      this.toastCtrl.create({
        message: 'Please select a destination and vehicle type.',
        duration: 2000,
        color: 'warning'
      }).then(t => t.present());
      return;
    }

    this.zone.run(() => {
      this.viewState = 'confirming';
      this.cdr.detectChanges();

      const requestBody = {
        pickupLat: this.currentCoords!.lat,
        pickupLong: this.currentCoords!.lng,
        dropLat: this.destCoords!.lat,
        dropLong: this.destCoords!.lng,
        pickupAddress: this.pickupLocation,
        dropAddress: this.destinationLocation,
        vehicleType: this.selectedVehicle?.name
      };

      this.apiService.post('ride/request', requestBody).subscribe({
        next: (res: any) => {
          console.log('Ride requested:', res);
          if (res.data && res.data.rideId) {
            this.pollRideStatus(res.data.rideId);
          }
        },
        error: (err: any) => {
          console.error('Ride request failed:', err);
          this.viewState = 'confirming';
          this.toastCtrl.create({
            message: 'Failed to request ride. Please try again.',
            duration: 3000,
            color: 'danger'
          }).then(t => t.present());
        }
      });
    });
  }

  private statusPollInterval: any;
  private currentRideId: number | null = null;

  private pollRideStatus(rideId: number) {
    this.currentRideId = rideId;
    if (this.statusPollInterval) clearInterval(this.statusPollInterval);

    this.statusPollInterval = setInterval(() => {
      this.apiService.get(`ride/status/${rideId}`).subscribe({
        next: (res: any) => {
          // Note: The API needs to return the current status and driver info
          const status = res.rideStatus;
          const driver = res.driver;

          if (status === 'Accepted' && this.tripStatus !== 'arriving') {
            this.zone.run(() => {
              this.driver = {
                name: driver?.fullName || 'Driver',
                phone: driver?.mobileNumber || '',
                rating: '4.8',
                vehicleModel: 'White Suzuki Dzire',
                vehiclePlate: 'TN 01 AB 1234'
              };
              this.otp = '1234';
              this.viewState = 'onTrip';
              this.tripStatus = 'arriving';
              this.updateDriverMarkerPosition(driver.currentLat, driver.currentLong);
              this.cdr.detectChanges();
            });
          } else if (status === 'Accepted' && this.tripStatus === 'arriving') {
             this.updateDriverMarkerPosition(driver.currentLat, driver.currentLong);
          } else if (status === 'Started' && this.tripStatus !== 'started') {
            this.zone.run(() => {
              this.tripStatus = 'started';
              this.startTrip();
              this.cdr.detectChanges();
            });
          } else if (status === 'Completed') {
            clearInterval(this.statusPollInterval);
            this.zone.run(() => {
              this.viewState = 'searching';
              this.resetMap();
              this.toastCtrl.create({ message: 'Trip Completed!', duration: 3000, color: 'success' }).then(t => t.present());
            });
          }
        },
        error: (err: any) => {
          // If 404, maybe it's not yet in the DB or there's an issue
          console.warn('Polling error:', err);
        }
      });
    }, 3000);
  }

  verifyOtp() {
    if (this.enteredOtp === this.otp) {
      this.startTrip();
    } else {
      this.toastCtrl.create({
        message: 'Invalid OTP. Please try again.',
        duration: 2000,
        color: 'danger',
        position: 'top'
      }).then(t => t.present());
    }
  }

  private clearMapLayers(keepDriver: boolean = false) {
    if (this.routeLine) this.map.removeLayer(this.routeLine);
    if (this.destMarker) this.map.removeLayer(this.destMarker);
    if (this.driverToUserRoute) this.map.removeLayer(this.driverToUserRoute);

    this.routeLine = null;
    this.destMarker = null;
    this.driverToUserRoute = null;

    if (!keepDriver && this.driverMarker) {
      this.map.removeLayer(this.driverMarker);
      this.driverMarker = null;
    }
  }

  startTrip() {
    this.zone.run(() => {
      this.tripStatus = 'started';
      this.enteredOtp = '';

      // Clear only arrival-specific layers, KEEP the driver/vehicle marker
      this.clearMapLayers(true);

      // Draw the road route to the final destination
      this.drawDestinationRoute(true);

      // Start the simulation from pickup to destination
      if (this.destCoords && (this.pickupCoords || this.currentCoords)) {
        const start = this.pickupCoords || this.currentCoords;
        if (this.driverMarker && start) {
          this.driverMarker.setLatLng([start.lat, start.lng]);
          this.simulateDriverMovement(
            start.lat,
            start.lng,
            this.destCoords.lat,
            this.destCoords.lng
          );
        }
      }

      this.toastCtrl.create({
        message: 'Trip started! Heading to destination.',
        duration: 2000,
        color: 'success',
        position: 'top'
      }).then(t => t.present());

      this.cdr.detectChanges();
    });
  }

  private drawDestinationRoute(isDuringTrip: boolean = false) {
    if (!this.pickupCoords || !this.destCoords) return;

    const origin = `${this.pickupCoords.lat},${this.pickupCoords.lng}`;
    const destString = `${this.destCoords.lat},${this.destCoords.lng}`;

    this.mapsService.getDirections(origin, destString).subscribe({
      next: (polylineStr) => {
        this.zone.run(() => {
          // If we are starting the trip, we keep the driver marker
          this.clearMapLayers(isDuringTrip);

          const destCoords: L.LatLngExpression = [this.destCoords!.lat, this.destCoords!.lng];
          this.destMarker = L.marker(destCoords)
            .addTo(this.map)
            .bindPopup(this.destinationLocation)
            .openPopup();

          const points = this.decodePolyline(polylineStr);
          this.routeLine = L.polyline(points, {
            color: '#8b1c2c',
            weight: 6,
            opacity: 0.8,
            lineJoin: 'round'
          }).addTo(this.map);

          // Fit bounds with enough padding for the "Trip Progress" UI at the bottom
          this.map.fitBounds(this.routeLine.getBounds(), {
            paddingTopLeft: [50, 50],
            paddingBottomRight: [50, 350]
          });
          this.cdr.detectChanges();
        });
      }
    });
  }

  completeTrip() {
    this.toastCtrl.create({
      message: 'You have reached your destination!',
      duration: 3000,
      color: 'dark',
      position: 'middle'
    }).then(t => t.present());
    this.cancelBooking();
  }

  cancelBooking() {
    this.viewState = 'searching';
    this.destinationLocation = '';
    this.destinationSearchQuery = '';
    this.selectedVehicle = null;
    this.destCoords = null;

    if (this.routeLine) {
      this.map.removeLayer(this.routeLine);
      this.routeLine = null;
    }
    if (this.destMarker) {
      this.map.removeLayer(this.destMarker);
      this.destMarker = null;
    }
    if (this.driverMarker) {
      this.map.removeLayer(this.driverMarker);
      this.driverMarker = null;
    }

    if (this.currentCoords) {
      this.map.setView([this.currentCoords.lat, this.currentCoords.lng], 15);
    }
    this.cdr.detectChanges();
  }

  private updateDriverMarkerPosition(lat: number, lng: number) {
    if (!this.map) return;

    const driverIcon = L.divIcon({
      className: 'driver-marker-container',
      html: `<div class="driver-marker-icon">${this.selectedVehicle?.icon || '🚗'}</div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    if (!this.driverMarker) {
      this.driverMarker = L.marker([lat, lng], { icon: driverIcon }).addTo(this.map);
    } else {
      this.driverMarker.setLatLng([lat, lng]);
    }

    // Adjust map to show both user and driver if arriving
    if (this.tripStatus === 'arriving' && this.currentCoords) {
      const bounds = L.latLngBounds([
        [this.currentCoords.lat, this.currentCoords.lng],
        [lat, lng]
      ]);
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  private showDriverOnMap(targetCoords?: {lat: number, lng: number}) {
    if (!this.map) return;

    // If target is provided, we move toward it (the trip)
    // Otherwise, we use default simulation for arrival
    const startPos = targetCoords ? (this.pickupCoords || this.currentCoords) : null;
    const endPos = targetCoords || (this.currentCoords || this.pickupCoords);

    if (!endPos) return;

    let driverLat, driverLng;

    if (targetCoords && startPos) {
      // Starting trip: driver is at pickup
      driverLat = startPos.lat;
      driverLng = startPos.lng;
    } else {
      // Arriving: driver is far away
      driverLat = endPos.lat + (Math.random() > 0.5 ? 0.007 : -0.007);
      driverLng = endPos.lng + (Math.random() > 0.5 ? 0.007 : -0.007);
    }

    const driverIcon = L.divIcon({
      className: 'driver-marker-container',
      html: `<div class="driver-marker-icon">${this.selectedVehicle?.icon || '🚗'}</div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    if (this.driverMarker) this.map.removeLayer(this.driverMarker);
    this.driverMarker = L.marker([driverLat, driverLng], { icon: driverIcon }).addTo(this.map);

    if (!targetCoords) {
      // Draw arrival route (Green)
      const driverOrigin = `${driverLat},${driverLng}`;
      const userDest = `${endPos.lat},${endPos.lng}`;

      this.mapsService.getDirections(driverOrigin, userDest).subscribe({
        next: (polylineStr) => {
          this.zone.run(() => {
            if (this.driverToUserRoute) this.map.removeLayer(this.driverToUserRoute);
            const points = this.decodePolyline(polylineStr);
            this.driverToUserRoute = L.polyline(points, {
              color: '#4CAF50',
              weight: 5,
              opacity: 0.7,
              dashArray: '10, 10'
            }).addTo(this.map);

            this.map.fitBounds(this.driverToUserRoute.getBounds(), {
              paddingTopLeft: [50, 150],
              paddingBottomRight: [50, 350]
            });
          });
        }
      });
    }

    // Simulate real-time movement toward target
    this.simulateDriverMovement(driverLat, driverLng, endPos.lat, endPos.lng);
  }

  private simulateDriverMovement(startLat: number, startLng: number, endLat: number, endLng: number) {
    let currentLat = startLat;
    let currentLng = startLng;
    const steps = 50; // Reduced steps for faster simulation in demo
    const latStep = (endLat - startLat) / steps;
    const lngStep = (endLng - startLng) / steps;
    let currentStep = 0;

    const interval = setInterval(() => {
      if (this.viewState !== 'onTrip') {
        clearInterval(interval);
        return;
      }

      if (currentStep >= steps) {
        clearInterval(interval);
        this.zone.run(() => {
          if (this.tripStatus === 'arriving') {
            this.tripStatus = 'arrived';
            this.toastCtrl.create({
              message: 'Your driver has arrived!',
              duration: 2500,
              color: 'success',
              position: 'top'
            }).then(t => t.present());
          }
          this.cdr.detectChanges();
        });
        return;
      }

      currentLat += latStep;
      currentLng += lngStep;
      currentStep++;

      // Update estimated minutes based on remaining steps
      if (this.tripStatus === 'arriving') {
        const remainingSteps = steps - currentStep;
        // Map steps to roughly 3 to 1 mins
        this.estimatedArrivalMins = Math.max(1, Math.ceil((remainingSteps / steps) * 3));
      }

      if (this.tripStatus === 'started' && this.distanceData) {
        const remainingSteps = steps - currentStep;
        const totalSeconds = this.distanceData.durationValue;
        const remainingSeconds = Math.round((remainingSteps / steps) * totalSeconds);
        const mins = Math.ceil(remainingSeconds / 60);
        this.remainingTripTime = mins > 0 ? `${mins} mins` : 'Arriving';
      }

      if (this.driverMarker) {
        this.driverMarker.setLatLng([currentLat, currentLng]);

        // Keep bounds updated occasionally
        if (currentStep % 20 === 0 && this.currentCoords) {
          const bounds = L.latLngBounds([
            [this.currentCoords.lat, this.currentCoords.lng],
            [currentLat, currentLng]
          ]);
          this.map.fitBounds(bounds, {
            paddingTopLeft: [50, 150],
            paddingBottomRight: [50, 350]
          });
        }
      }
    }, 1000); // Update every second
  }

  setTab(tab: string) { this.activeTab = tab; }

  private decodePolyline(encoded: string): L.LatLngTuple[] {
    const points: L.LatLngTuple[] = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;

    while (index < len) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      points.push([lat / 1e5, lng / 1e5]);
    }
    return points;
  }

  private resetMap() {
    this.destinationLocation = '';
    this.destinationSearchQuery = '';
    this.selectedVehicle = null;
    this.destCoords = null;
    this.driver = null;
    this.otp = '';
    this.enteredOtp = '';
    this.clearMapLayers(false);
    if (this.currentCoords) {
      this.map.setView([this.currentCoords.lat, this.currentCoords.lng], 15);
    }
  }

  logout() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    localStorage.removeItem('token');
    this.router.navigate(['/login']);
  }

  ngOnDestroy() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    if (this.map) this.map.remove();
  }

  recenterMap() {
    if (this.map && this.currentCoords) {
      this.map.invalidateSize();
      this.map.setView([this.currentCoords.lat, this.currentCoords.lng], 16, { animate: true });
    }
  }
}

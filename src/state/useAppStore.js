import { create } from 'zustand';

export const useAppStore = create((set, get) => ({
  language: 'zh',
  cameraMode: 'map',
  nearbyLandmarkId: null,
  selectedLandmarkId: null,
  vehicleSpeed: 0,
  vehicleSteer: 0,
  routeContext: null,
  routeProgress: 0,
  routeDay: 1,
  routeHour: 7,
  activeRouteIds: [],
  activeRouteGeometryCoordinates: [],
  activeRouteDistanceKm: null,
  guidedTourState: 'IDLE',
  guidedTourLandmarkId: null,
  guidedTourMessage: '',
  arrivalNotice: null,
  arrivedLandmarkIds: [],
  tourResetToken: 0,
  tourSpeedMultiplier: 8,
  routeJumpRequest: null,
  autoDrive: false,
  sidebarOpen: true,
  focusPanelOpen: false,
  modelViewerOpen: false,
  setLanguage: (language) => set({ language }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  toggleMapView: () => {
    const { cameraMode, selectedLandmarkId, focusPanelOpen, modelViewerOpen } = get();
    if (focusPanelOpen || modelViewerOpen) return;
    if (cameraMode === 'focus' && selectedLandmarkId) {
      set({ cameraMode: 'follow' });
      return;
    }
    set({ cameraMode: cameraMode === 'map' ? 'follow' : 'map' });
  },
  toggleAutoDrive: () => {
    const { focusPanelOpen, modelViewerOpen } = get();
    if (focusPanelOpen || modelViewerOpen) return;
    set((state) => ({ autoDrive: !state.autoDrive, cameraMode: 'follow' }));
  },
  setAutoDrive: (autoDrive) => set((state) => ({
    autoDrive,
    cameraMode: autoDrive && !state.focusPanelOpen && !state.modelViewerOpen ? 'follow' : state.cameraMode,
  })),
  setTourSpeedMultiplier: (tourSpeedMultiplier) => set({
    tourSpeedMultiplier: Math.min(Math.max(Number(tourSpeedMultiplier) || 1, 1), 30),
  }),
  jumpToRouteStop: (landmarkId) => set((state) => {
    const fallbackIds = ['milan_duomo', 'venice_rialto', 'florence_duomo', 'pisa', 'colosseum', 'pompeii'];
    const routeIds = state.activeRouteIds.length ? state.activeRouteIds : fallbackIds;
    const stopIndex = Math.max(routeIds.indexOf(landmarkId), 0);
    const isLastStop = stopIndex === routeIds.length - 1;
    return {
      autoDrive: false,
      routeJumpRequest: { landmarkId, token: Date.now() },
      arrivedLandmarkIds: routeIds.slice(0, stopIndex),
      arrivalNotice: { landmarkId },
      nearbyLandmarkId: landmarkId,
      selectedLandmarkId: null,
      focusPanelOpen: false,
      modelViewerOpen: false,
      guidedTourState: isLastStop ? 'FINISHED' : 'FOCUS_POI',
      guidedTourLandmarkId: landmarkId,
      guidedTourMessage: isLastStop ? '路线导览完成' : '已跳转到此站',
      cameraMode: state.cameraMode === 'free' ? 'free' : 'follow',
    };
  }),
  resetVehicleTour: () => set((state) => ({
    autoDrive: false,
    tourResetToken: state.tourResetToken + 1,
    routeProgress: 0,
    vehicleSpeed: 0,
    vehicleSteer: 0,
    nearbyLandmarkId: null,
    guidedTourState: 'IDLE',
    guidedTourLandmarkId: null,
    guidedTourMessage: '',
    arrivalNotice: null,
    arrivedLandmarkIds: [],
    routeJumpRequest: null,
    cameraMode: 'follow',
  })),
  setNearbyLandmarkId: (nearbyLandmarkId) => set({ nearbyLandmarkId }),
  setVehicleState: ({ vehicleSpeed, vehicleSteer, routeContext, routeProgress, routeDay, routeHour }) => set((state) => ({
    vehicleSpeed,
    vehicleSteer,
    routeContext: routeContext ?? state.routeContext,
    routeProgress: routeProgress ?? state.routeProgress,
    routeDay: routeDay ?? state.routeDay,
    routeHour: routeHour ?? state.routeHour,
  })),
  setActiveRouteIds: (activeRouteIds) => set((state) => ({
    activeRouteIds,
    tourResetToken: state.tourResetToken + 1,
    autoDrive: false,
    routeProgress: 0,
    vehicleSpeed: 0,
    vehicleSteer: 0,
    nearbyLandmarkId: null,
    selectedLandmarkId: null,
    focusPanelOpen: false,
    modelViewerOpen: false,
    guidedTourState: 'IDLE',
    guidedTourLandmarkId: null,
    guidedTourMessage: '',
    arrivalNotice: null,
    arrivedLandmarkIds: [],
    routeJumpRequest: null,
    cameraMode: 'follow',
  })),
  setActiveRouteGeometry: ({ coordinates = [], distanceKm = null } = {}) => set((state) => ({
    activeRouteGeometryCoordinates: coordinates,
    activeRouteDistanceKm: distanceKm,
    tourResetToken: state.tourResetToken + 1,
    autoDrive: false,
    routeProgress: 0,
    vehicleSpeed: 0,
    vehicleSteer: 0,
    nearbyLandmarkId: null,
    selectedLandmarkId: null,
    focusPanelOpen: false,
    modelViewerOpen: false,
    guidedTourState: 'IDLE',
    guidedTourLandmarkId: null,
    guidedTourMessage: '',
    arrivalNotice: null,
    arrivedLandmarkIds: [],
    routeJumpRequest: null,
    cameraMode: 'follow',
  })),
  setGuidedTourState: ({ guidedTourState = 'IDLE', guidedTourLandmarkId = null, guidedTourMessage = '' } = {}) => set({
    guidedTourState,
    guidedTourLandmarkId,
    guidedTourMessage,
  }),
  showArrivalNotice: (landmarkId) => set((state) => {
    if (!landmarkId || state.arrivedLandmarkIds.includes(landmarkId) || state.arrivalNotice?.landmarkId === landmarkId) return {};
    return {
      autoDrive: false,
      arrivalNotice: { landmarkId },
      guidedTourState: 'FOCUS_POI',
      guidedTourLandmarkId: landmarkId,
      guidedTourMessage: '已到达景点',
    };
  }),
  continueVehicleTour: () => set((state) => {
    const arrivedId = state.arrivalNotice?.landmarkId;
    return {
      autoDrive: true,
      cameraMode: 'follow',
      arrivalNotice: null,
      arrivedLandmarkIds: arrivedId && !state.arrivedLandmarkIds.includes(arrivedId)
        ? [...state.arrivedLandmarkIds, arrivedId]
        : state.arrivedLandmarkIds,
      guidedTourState: 'DRIVING',
      guidedTourLandmarkId: null,
      guidedTourMessage: '',
    };
  }),
  clearGuidedTourFocus: () => set({
    selectedLandmarkId: null,
    focusPanelOpen: false,
    modelViewerOpen: false,
    guidedTourLandmarkId: null,
    guidedTourMessage: '',
  }),
  selectLandmark: (selectedLandmarkId) => set({ selectedLandmarkId, focusPanelOpen: false, modelViewerOpen: false, cameraMode: 'focus' }),
  openLandmarkFocus: (selectedLandmarkId) => set({ selectedLandmarkId, focusPanelOpen: true, modelViewerOpen: false, cameraMode: 'focus', autoDrive: false }),
  clearLandmark: () => set({ selectedLandmarkId: null, focusPanelOpen: false, modelViewerOpen: false, cameraMode: 'follow', autoDrive: false }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setFocusPanelOpen: (focusPanelOpen) => set((state) => ({ focusPanelOpen, autoDrive: focusPanelOpen ? false : state.autoDrive })),
  setModelViewerOpen: (modelViewerOpen) => set((state) => ({ modelViewerOpen, autoDrive: modelViewerOpen ? false : state.autoDrive })),
}));

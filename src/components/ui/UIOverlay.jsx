import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../state/useAppStore.js';
import { landmarks } from '../../data/landmarks.js';
import { useLandmarkReviews } from '../../hooks/useLandmarkReviews.js';
import { ModelViewerOverlay } from './ModelViewerOverlay.jsx';
import { reviewLocales } from '../../data/reviewLocales.js';
import { travelLandmarkMeta } from '../../data/travelGuide.js';

const driveRouteCopy = {
  en: {
    title: '意大利行车导览',
    waypointNearby: '临近地标',
    guideStateLabel: '导览状态',
    guideStates: {
      IDLE: '待开始',
      DRIVING: '自动导览中',
      APPROACH_POI: '接近景点',
      FOCUS_POI: '到站停靠',
      RESUME: '继续导览',
      FINISHED: '路线导览完成',
    },
    speedUnit: '公里/小时',
    dayLabel: '第 {day} 天',
    timeLabel: '{hour}',
    trafficLabels: {
      free: '畅通',
      normal: '正常',
      slow: '缓行',
      traffic_jam: '拥堵',
    },
    segmentTypes: {
      city: '城市街道',
      motorway: '高速公路',
      scenic: '风景道路',
      mountain: '山地路段',
      bridge: '潟湖入口路',
      tunnel: '山地隧道',
      ringRoad: '罗马环路',
    },
    surfaceLabels: {
      'asphalt / stone edge': '沥青 / 石材边缘',
      'smooth asphalt': '平整沥青',
      'rolling asphalt': '起伏沥青路面',
      'graded mountain road': '山地坡道路面',
      'low coastal roadway': '低海岸道路',
      'covered roadway': '隧道道路',
      'urban arterial': '城市主干路',
    },
    descriptions: {
      milan_city: '进入历史城区的密集街道',
      a4_lombardy: '意大利北部的长距离高速通道',
      venice_lagoon: '抵达威尼斯陆路入口附近',
      veneto_emilia: '威尼托到艾米利亚之间的平直高速',
      apennine_crossing: '跨越亚平宁山脉的爬坡路段',
      apennine_tunnel: '通向佛罗伦萨的隧道下坡',
      tuscany_west: '托斯卡纳西侧起伏的主干道路',
      tuscany_to_rome: '穿过乡野景观的长距离转场',
      rome_arrival: '进入罗马都会区的繁忙道路',
      a1_campania: '向坎帕尼亚南下的高速路段',
      pompeii_arrival: '靠近遗址的城市抵达路段',
    },
    tourPanel: {
      routeName: '当前路线',
      currentStop: '当前站点',
      nextStop: '下一站',
      progress: '导览进度',
      speed: '当前速度',
      start: '开始导览',
      pause: '暂停',
      resume: '继续',
      reset: '重置',
      defaultRoute: '意大利经典路线',
      freeRoute: '自定义路线',
      noStop: '路线起点',
      finished: '已完成',
      viewMode: '视角模式',
      followView: '跟随视角',
      mapView: '俯视视角',
      freeView: '自由视角',
      arrived: '已到达',
      rating: '评分',
      stay: '建议停留',
      continue: '继续导览',
      startHint: '点击开始导览',
      pausedHint: '已暂停，点击继续导览',
      completeHint: '路线导览完成',
      arrivalNotice: '到站提示',
      detail: '查看详情',
      timeline: '路线时间轴',
      reached: '已到达',
      heading: '前往中',
      pending: '未到达',
      summaryTitle: '导览完成',
      visitedCount: '已游览景点',
      routeDistance: '模拟路线距离',
      nextStep: '推荐下一步：可重新导览、切换路线，或返回首页调整路线。',
      restart: '重新导览',
      switchRoute: '切换路线',
      home: '返回首页',
      tourSpeed: '导览速度',
      playRate: '播放倍率',
      speedLeisure: '悠闲 1x',
      speedStandard: '标准 4x',
      speedFast: '快速 8x',
      speedDemo: '演示 20x',
      jumpHint: '点击跳转到此站',
      continueFromHere: '从此处继续导览',
      speedLimit: '道路限速',
    },
  },
  zh: {
    title: '意大利行车导览',
    waypointNearby: '临近地标',
    guideStateLabel: '沉浸导览',
    guideStates: {
      IDLE: '待机',
      DRIVING: '巡航中',
      APPROACH_POI: '接近景点',
      FOCUS_POI: '沉浸聚焦',
      RESUME: '回到路线',
      FINISHED: '已完成',
    },
    speedUnit: '公里/小时',
    dayLabel: '第 {day} 天',
    timeLabel: '{hour}',
    trafficLabels: {
      free: '畅通',
      normal: '正常',
      slow: '缓行',
      traffic_jam: '拥堵',
    },
    segmentTypes: {
      city: '城市街道',
      motorway: '高速公路',
      scenic: '风景道路',
      mountain: '山地路段',
      bridge: '潟湖入口路',
      tunnel: '山地隧道',
      ringRoad: '罗马环路',
    },
    surfaceLabels: {
      'asphalt / stone edge': '沥青 / 石材边缘',
      'smooth asphalt': '平整沥青',
      'rolling asphalt': '起伏沥青路面',
      'graded mountain road': '山地坡道路面',
      'low coastal roadway': '低海岸道路',
      'covered roadway': '隧道道路',
      'urban arterial': '城市主干路',
    },
    descriptions: {
      milan_city: '进入历史城区的密集街道',
      a4_lombardy: '意大利北部的长距离高速通道',
      venice_lagoon: '抵达威尼斯陆路入口附近',
      veneto_emilia: '威尼托到艾米利亚之间的平直高速',
      apennine_crossing: '跨越亚平宁山脉的爬坡路段',
      apennine_tunnel: '通向佛罗伦萨的隧道下坡',
      tuscany_west: '托斯卡纳西侧起伏的主干道路',
      tuscany_to_rome: '穿过乡野景观的长距离转场',
      rome_arrival: '进入罗马都会区的繁忙道路',
      a1_campania: '向坎帕尼亚南下的高速路段',
      pompeii_arrival: '靠近遗址的城市抵达路段',
    },
    tourPanel: {
      routeName: '当前路线',
      currentStop: '当前站点',
      nextStop: '下一站',
      progress: '导览进度',
      speed: '当前速度',
      start: '开始导览',
      pause: '暂停',
      resume: '继续',
      reset: '重置路线',
      defaultRoute: '意大利经典路线',
      freeRoute: '自定义路线',
      noStop: '路线起点',
      finished: '已完成',
      viewMode: '视角模式',
      followView: '跟随视角',
      mapView: '俯视视角',
      freeView: '自由视角',
      arrived: '已到达',
      rating: '评分',
      stay: '建议停留',
      continue: '继续导览',
      startHint: '点击开始导览',
      pausedHint: '已暂停，点击继续导览',
      completeHint: '路线导览完成',
      arrivalNotice: '到站提示',
      detail: '查看详情',
      timeline: '路线时间轴',
      reached: '已到达',
      heading: '前往中',
      pending: '未到达',
      summaryTitle: '导览完成',
      visitedCount: '已游览景点',
      routeDistance: '模拟路线距离',
      nextStep: '推荐下一步：可重新导览、切换路线，或返回首页调整路线。',
      restart: '重新导览',
      switchRoute: '切换路线',
      home: '返回首页',
      tourSpeed: '导览速度',
      playRate: '播放倍率',
      speedLeisure: '悠闲 1x',
      speedStandard: '标准 4x',
      speedFast: '快速 8x',
      speedDemo: '演示 20x',
      jumpHint: '点击跳转到此站',
      continueFromHere: '从此处继续导览',
      speedLimit: '道路限速',
    },
  },
};

function getLandmarkName(landmark, language) {
  return travelLandmarkMeta[landmark?.id]?.name?.[language] ?? landmark?.name ?? '';
}

function getLandmarkDescription(landmark, language) {
  return travelLandmarkMeta[landmark?.id]?.blurb?.[language] ?? landmark?.description ?? '';
}

function getShortText(text, maxLength = 58) {
  if (!text || text.length <= maxLength) return text ?? '';
  return `${text.slice(0, maxLength)}…`;
}

function getArrivalMeta(landmarkId) {
  const fallback = { rating: '4.8', stay: '45 分钟' };
  const table = {
    milan_duomo: { rating: '4.9', stay: '60 分钟' },
    venice_rialto: { rating: '4.7', stay: '40 分钟' },
    florence_duomo: { rating: '4.8', stay: '55 分钟' },
    pisa: { rating: '4.7', stay: '45 分钟' },
    colosseum: { rating: '4.9', stay: '75 分钟' },
    pompeii: { rating: '4.8', stay: '90 分钟' },
  };
  return table[landmarkId] ?? fallback;
}

function formatHour(hour) {
  const safeHour = Number.isFinite(hour) ? hour : 7;
  const h = Math.floor(safeHour);
  const m = Math.round((safeHour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function UIOverlay({ isStarted, onClose }) {
  const {
    language,
    cameraMode,
    nearbyLandmarkId,
    selectedLandmarkId,
    routeContext,
    routeDay,
    routeHour,
    routeProgress,
    activeRouteIds,
    activeRouteDistanceKm,
    guidedTourState,
    guidedTourLandmarkId,
    guidedTourMessage,
    vehicleSpeed,
    tourSpeedMultiplier,
    arrivalNotice,
    arrivedLandmarkIds,
    focusPanelOpen,
    modelViewerOpen,
    autoDrive,
    setFocusPanelOpen,
    setModelViewerOpen,
    setCameraMode,
    setAutoDrive,
    setTourSpeedMultiplier,
    resetVehicleTour,
    continueVehicleTour,
    toggleMapView,
    toggleAutoDrive,
    openLandmarkFocus,
    clearLandmark,
    jumpToRouteStop,
  } = useAppStore();

  const nearbyLandmark = landmarks.find((item) => item.id === nearbyLandmarkId);
  const selectedLandmark = landmarks.find((item) => item.id === selectedLandmarkId);
  const guidedTourLandmark = landmarks.find((item) => item.id === guidedTourLandmarkId);
  const arrivalLandmark = landmarks.find((item) => item.id === arrivalNotice?.landmarkId);
  const displayLandmark = selectedLandmark ?? nearbyLandmark;
  const { data: reviewPayload, isLoading } = useLandmarkReviews(selectedLandmarkId, language);
  const locale = reviewLocales[language];
  const routeCopy = driveRouteCopy[language] ?? driveRouteCopy.en;
  const localizedReviews = useMemo(() => {
    if (!selectedLandmarkId) return [];
    return locale.landmarks[selectedLandmarkId] ?? [];
  }, [language, locale.landmarks, selectedLandmarkId]);
  const comments = localizedReviews.length > 0 ? localizedReviews : reviewPayload?.reviews ?? [];
  const routeLocked = focusPanelOpen || modelViewerOpen;
  const routePoint = routeContext?.point;
  const routeSegment = routeContext?.segment;
  const routeProfile = routeContext?.profile;
  const panelCopy = routeCopy.tourPanel;
  const speedPresets = [
    { label: panelCopy.speedLeisure, value: 1 },
    { label: panelCopy.speedStandard, value: 4 },
    { label: panelCopy.speedFast, value: 8 },
    { label: panelCopy.speedDemo, value: 20 },
  ];
  const displayRouteIds = activeRouteIds.length ? activeRouteIds : ['milan_duomo', 'venice_rialto', 'florence_duomo', 'pisa', 'colosseum', 'pompeii'];
  const routeStops = displayRouteIds.map((id) => landmarks.find((item) => item.id === id)).filter(Boolean);
  const progressPercent = Math.round((routeProgress ?? 0) * 100);
  const currentStopIndex = Math.min(Math.floor((routeProgress ?? 0) * Math.max(routeStops.length - 1, 1)), Math.max(routeStops.length - 1, 0));
  const currentStop = nearbyLandmark ?? routeStops[currentStopIndex];
  const nextStop = routeStops.find((_, index) => index > currentStopIndex) ?? null;
  const isPaused = !autoDrive;
  const isComplete = progressPercent >= 100 || guidedTourState === 'FINISHED';
  const tourHint = isComplete ? panelCopy.completeHint : autoDrive ? '' : progressPercent > 0 ? panelCopy.pausedHint : panelCopy.startHint;
  const arrivalMeta = getArrivalMeta(arrivalLandmark?.id);
  const [timelineLandmarkId, setTimelineLandmarkId] = useState(null);
  const timelineLandmark = landmarks.find((item) => item.id === timelineLandmarkId);
  const timelineMeta = getArrivalMeta(timelineLandmark?.id);
  const visitedCount = Math.max(arrivedLandmarkIds.length, isComplete ? routeStops.length : 0);
  const distanceText = activeRouteDistanceKm ? `${Math.round(activeRouteDistanceKm)} km` : '约 920 km';

  useEffect(() => {
    if (!isStarted) return undefined;

    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();

      if (key === 'v' && !routeLocked) {
        toggleMapView();
        return;
      }

      if (key === 'r' && !routeLocked) {
        toggleAutoDrive();
        return;
      }

      if (key === 'f' && nearbyLandmarkId && !modelViewerOpen) {
        setAutoDrive(false);
        if (selectedLandmarkId === nearbyLandmarkId && !focusPanelOpen) {
          setFocusPanelOpen(true);
          return;
        }
        openLandmarkFocus(nearbyLandmarkId);
        return;
      }

      if (event.key === 'Escape') {
        if (modelViewerOpen) {
          setModelViewerOpen(false);
          return;
        }
        if (focusPanelOpen || selectedLandmarkId) {
          clearLandmark();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    clearLandmark,
    focusPanelOpen,
    isStarted,
    modelViewerOpen,
    nearbyLandmarkId,
    openLandmarkFocus,
    routeLocked,
    selectedLandmarkId,
    setAutoDrive,
    setTourSpeedMultiplier,
    resetVehicleTour,
    continueVehicleTour,
    setFocusPanelOpen,
    setModelViewerOpen,
    toggleAutoDrive,
    toggleMapView,
  ]);

  useEffect(() => {
    setTimelineLandmarkId(null);
  }, [displayRouteIds.join('|')]);

  useEffect(() => {
    document.body.classList.toggle('route-locked', routeLocked);
    return () => document.body.classList.remove('route-locked');
  }, [routeLocked]);

  useEffect(() => {
    if (!selectedLandmarkId || !nearbyLandmarkId || selectedLandmarkId === nearbyLandmarkId) return;
    if (focusPanelOpen || modelViewerOpen) return;
    clearLandmark();
  }, [clearLandmark, focusPanelOpen, modelViewerOpen, nearbyLandmarkId, selectedLandmarkId]);

  if (!isStarted) return null;

  const dayText = routeCopy.dayLabel.replace('{day}', routeDay ?? 1);
  const timeText = routeCopy.timeLabel.replace('{hour}', formatHour(routeHour));

  return (
    <>
      <div className="hud-title is-visible">{routeCopy.title}</div>
      <div className={`hud-mode is-visible ${autoDrive ? 'is-autodriving' : ''}`}>
        {cameraMode === 'focus' ? locale.ui.landmarkFocus : cameraMode === 'follow' ? (autoDrive ? locale.ui.autoDriving : locale.ui.drivingView) : cameraMode === 'free' ? panelCopy.freeView : panelCopy.mapView}
      </div>

      <div className={`guided-tour-status is-visible guided-tour-status--${guidedTourState || 'IDLE'}`} aria-live="polite">
        <span>{routeCopy.guideStateLabel}</span>
        <strong>{routeCopy.guideStates[guidedTourState] ?? routeCopy.guideStates.IDLE}</strong>
        {(guidedTourLandmark || guidedTourMessage || tourHint) && (
          <p>{guidedTourMessage || getLandmarkName(guidedTourLandmark, language) || tourHint}</p>
        )}
      </div>

      <button className={`btn-map-view ${cameraMode !== 'map' && !routeLocked ? 'is-visible' : ''}`} onClick={() => setCameraMode('map')}>
        <svg className="btn-map-view__icon" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor" opacity="0.6" />
          <rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor" />
          <rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor" />
          <rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="0.6" />
        </svg>
        {locale.ui.mapView}
      </button>

      <aside className="tour-info-panel" aria-live="polite">
        <p className="tour-info-panel__eyebrow">小车导览</p>
        <h2>{panelCopy.defaultRoute}</h2>
        <dl>
          <div><dt>{panelCopy.routeName}</dt><dd>{activeRouteIds.length ? panelCopy.freeRoute : panelCopy.defaultRoute}</dd></div>
          <div><dt>{panelCopy.currentStop}</dt><dd>{isComplete ? panelCopy.completeHint : getLandmarkName(currentStop, language) || panelCopy.noStop}</dd></div>
          <div><dt>{panelCopy.nextStop}</dt><dd>{isComplete ? panelCopy.finished : getLandmarkName(nextStop, language) || panelCopy.finished}</dd></div>
          <div><dt>{panelCopy.progress}</dt><dd>{progressPercent}%</dd></div>
          <div><dt>{panelCopy.speed}</dt><dd>{Math.round(vehicleSpeed ?? 0)} {routeCopy.speedUnit}</dd></div>
          <div><dt>{panelCopy.playRate}</dt><dd>{tourSpeedMultiplier}x</dd></div>
        </dl>
        <div className="tour-info-panel__progress"><span style={{ width: `${progressPercent}%` }} /></div>
        <p className="tour-info-panel__subhead">{panelCopy.tourSpeed}</p>
        <div className="tour-speed-controls">
          <div className="tour-speed-controls__presets">
            {speedPresets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={tourSpeedMultiplier === preset.value ? 'is-active' : ''}
                onClick={() => setTourSpeedMultiplier(preset.value)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label>
            <span>{tourSpeedMultiplier}x</span>
            <input
              type="range"
              min="1"
              max="30"
              value={tourSpeedMultiplier}
              onChange={(event) => setTourSpeedMultiplier(event.target.value)}
            />
          </label>
        </div>
        <p className="tour-info-panel__subhead">{panelCopy.viewMode}</p>
        <div className="tour-info-panel__view-actions">
          <button type="button" className={cameraMode === 'follow' ? 'is-active' : ''} onClick={() => setCameraMode('follow')}>{panelCopy.followView}</button>
          <button type="button" className={cameraMode === 'map' ? 'is-active' : ''} onClick={() => setCameraMode('map')}>{panelCopy.mapView}</button>
          <button type="button" className={cameraMode === 'free' ? 'is-active' : ''} onClick={() => setCameraMode('free')}>{panelCopy.freeView}</button>
        </div>
        <div className="tour-info-panel__actions">
          <button type="button" onClick={() => setAutoDrive(true)} disabled={autoDrive || isComplete}>
            {isComplete ? panelCopy.finished : progressPercent > 0 && isPaused ? panelCopy.resume : panelCopy.start}
          </button>
          <button type="button" onClick={() => setAutoDrive(false)} disabled={!autoDrive}>{panelCopy.pause}</button>
          <button type="button" onClick={resetVehicleTour}>{panelCopy.reset}</button>
        </div>
      </aside>

      {arrivalLandmark && !isComplete && (
        <aside className="arrival-card" role="dialog" aria-live="polite">
          <p>{panelCopy.arrivalNotice} · {panelCopy.arrived}</p>
          <h2>{getLandmarkName(arrivalLandmark, language)}</h2>
          <span>{getShortText(getLandmarkDescription(arrivalLandmark, language))}</span>
          <div className="arrival-card__meta">
            <strong>{travelLandmarkMeta[arrivalLandmark.id]?.type?.[language] ?? '精选景点'}</strong>
            <strong>{panelCopy.rating} {arrivalMeta.rating}</strong>
            <strong>{panelCopy.stay} {arrivalMeta.stay}</strong>
          </div>
          <p className="arrival-card__reason">推荐理由：适合作为本段路线的重点停靠点，建议短暂停留拍照并查看建筑细节。</p>
          <div className="arrival-card__actions">
            <button type="button" onClick={continueVehicleTour}>{panelCopy.continueFromHere}</button>
            <button type="button" onClick={() => openLandmarkFocus(arrivalLandmark.id)}>{panelCopy.detail}</button>
          </div>
        </aside>
      )}


      <div className="route-timeline" aria-label={panelCopy.timeline}>
        <p>{panelCopy.timeline}</p>
        <div className="route-timeline__track">
          {routeStops.map((stop, index) => {
            const stopProgress = routeStops.length <= 1 ? 0 : index / (routeStops.length - 1);
            const reached = arrivedLandmarkIds.includes(stop.id) || routeProgress >= stopProgress || isComplete;
            const current = !isComplete && index === Math.min(currentStopIndex + 1, routeStops.length - 1);
            const statusText = reached ? panelCopy.reached : current ? panelCopy.heading : panelCopy.pending;
            return (
              <button
                key={stop.id}
                type="button"
                className={`route-timeline__stop ${reached ? 'is-reached' : ''} ${current ? 'is-current' : ''}`}
                title={panelCopy.jumpHint}
                onClick={() => {
                  setTimelineLandmarkId(stop.id);
                  jumpToRouteStop(stop.id);
                }}
              >
                <span>{index + 1}</span>
                <strong>{getLandmarkName(stop, language)}</strong>
                <em>{statusText}</em>
              </button>
            );
          })}
        </div>
      </div>

      {timelineLandmark && (
        <aside className="timeline-popover">
          <button type="button" onClick={() => setTimelineLandmarkId(null)}>×</button>
          <p>{panelCopy.timeline}</p>
          <h2>{getLandmarkName(timelineLandmark, language)}</h2>
          <span>{getShortText(getLandmarkDescription(timelineLandmark, language), 52)}</span>
          <div><strong>{panelCopy.rating} {timelineMeta.rating}</strong><strong>{panelCopy.stay} {timelineMeta.stay}</strong></div>
        </aside>
      )}

      {isComplete && (
        <aside className="tour-summary-card" role="dialog" aria-live="polite">
          <p>{panelCopy.summaryTitle}</p>
          <h2>{panelCopy.defaultRoute}</h2>
          <div><span>{panelCopy.visitedCount}</span><strong>{visitedCount} / {routeStops.length}</strong></div>
          <div><span>{panelCopy.routeDistance}</span><strong>{distanceText}</strong></div>
          <small>{panelCopy.nextStep}</small>
          <section>
            <button type="button" onClick={resetVehicleTour}>{panelCopy.restart}</button>
            <button type="button" onClick={onClose}>{panelCopy.switchRoute}</button>
            <button type="button" onClick={onClose}>{panelCopy.home}</button>
          </section>
        </aside>
      )}

      <div className="hud-hints is-visible">
        <span className="hud-key"><kbd>W</kbd><kbd>S</kbd> {locale.ui.cruise}</span>
        <span className="hud-key"><kbd>R</kbd> {locale.ui.auto}</span>
        <span className="hud-key"><kbd>V</kbd> {locale.ui.view}</span>
        <span className="hud-key"><kbd>F</kbd> {locale.ui.explore}</span>
      </div>

      <div className="hud-time is-visible">
        <span>{dayText}</span>
        <strong>{timeText}</strong>
      </div>

      <div className="hud-speed is-visible" aria-live="polite">
        <span className={`hud-speed__val ${autoDrive ? 'is-boosting' : ''}`}>{Math.round(vehicleSpeed ?? 0)}</span>
        <span className="hud-speed__unit">{routeCopy.speedUnit}</span>
      </div>

      {routeSegment && (
        <div className={`hud-road is-visible hud-road--${routeSegment.trafficState}`}>
          <div>
            <span>{routeCopy.segmentTypes[routeSegment.type] ?? routeProfile?.roadLabel ?? routeSegment.type}</span>
            <strong>{panelCopy.speedLimit} {Math.round(routeSegment.speedLimit)} {routeCopy.speedUnit}</strong>
          </div>
          <p>
            {routeCopy.trafficLabels[routeSegment.trafficState] ?? routeProfile?.trafficLabel ?? routeSegment.trafficState}
            {routeProfile?.surfaceLabel ? ` / ${routeCopy.surfaceLabels[routeProfile.surfaceLabel] ?? routeProfile.surfaceLabel}` : ''}
            {routeSegment.description ? ` / ${routeCopy.descriptions[routeSegment.id] ?? routeSegment.description}` : ''}
            {routePoint?.landmarkId ? ` / ${routeCopy.waypointNearby}` : ''}
          </p>
        </div>
      )}

      <div className={`interact-prompt ${nearbyLandmarkId && cameraMode !== 'map' && !routeLocked ? 'is-visible' : ''}`} aria-live="polite">
        <span className="interact-prompt__key">F</span>
        <span className="interact-prompt__text">{nearbyLandmarkId ? locale.ui.openSideBriefing : locale.ui.cruiseAndDiscover}</span>
      </div>

      <aside className={`poi-side poi-side--left ${displayLandmark && !focusPanelOpen && cameraMode !== 'map' ? 'is-visible' : ''}`} aria-live="polite">
        <div className="poi-side__panel">
          <p className="poi-side__eyebrow">{locale.ui.routeBriefing}</p>
          <h2 className="poi-side__title">{getLandmarkName(displayLandmark, language) || 'Landmark'}</h2>
          <p className="poi-side__body">{getLandmarkDescription(displayLandmark, language)}</p>
          <div className="poi-side__actions">
            <button className="poi-side__btn" type="button" onClick={() => displayLandmark && openLandmarkFocus(displayLandmark.id)}>
              {locale.ui.enterFocus}
            </button>
          </div>
        </div>
      </aside>

      <div className={`focus-shell ${focusPanelOpen ? 'is-visible' : ''}`} aria-hidden={!focusPanelOpen}>
        <aside className="focus-side focus-side--left" role="dialog" aria-modal="true" aria-labelledby="focus-title">
          <button className="focus-back" type="button" onClick={() => clearLandmark()}>{locale.ui.backToRoute}</button>
          <p className="focus-tag">{locale.ui.architecturalStory}</p>
          <h2 id="focus-title" className="focus-title">{getLandmarkName(selectedLandmark, language) || 'Landmark'}</h2>
          <p className="focus-description">{getLandmarkDescription(selectedLandmark, language)}</p>
          {selectedLandmark && (
            <button className="focus-model-btn" type="button" onClick={() => setModelViewerOpen(true)}>
              {locale.ui.view3dModel}
            </button>
          )}
        </aside>

        <aside className="focus-side focus-side--right">
          <p className="focus-tag">{locale.ui.fieldNotes}</p>
          <div className="focus-reviews">
            {isLoading && <p className="focus-review-empty">{locale.ui.loadingReviews}</p>}
            {!isLoading && comments.length === 0 && <p className="focus-review-empty">{locale.ui.noReviews}</p>}
            {comments.map((comment) => (
              <article key={`${comment.author}-${comment.score}`} className="focus-review-card">
                <div className="focus-review-card__meta">
                  <span>{comment.author}</span>
                  <span>{comment.score}</span>
                </div>
                <p className="focus-review-card__body">{comment.comment}</p>
                <p className="focus-review-card__source">{comment.source}</p>
              </article>
            ))}
          </div>
        </aside>
      </div>

      <ModelViewerOverlay landmark={selectedLandmark} isOpen={modelViewerOpen} onClose={() => setModelViewerOpen(false)} />
    </>
  );
}

const reviewsEn = {
  colosseum: [],
  pisa: [],
  florence_duomo: [],
  venice_rialto: [],
  milan_duomo: [],
  pompeii: [],
};

const reviewsZh = {
  colosseum: [],
  pisa: [],
  florence_duomo: [],
  venice_rialto: [],
  milan_duomo: [],
  pompeii: [],
};

export const reviewLocales = {
  en: {
    ui: {
      score: 'score',
      mapView: '俯视视角',
      cruise: '巡航',
      auto: '自动导览',
      view: '视角',
      explore: '探索',
      openSideBriefing: '打开侧边导览',
      cruiseAndDiscover: '沿路巡游，发现地标',
      routeBriefing: '路线简报',
      enterFocus: '进入聚焦',
      backToRoute: '返回路线',
      architecturalStory: '建筑叙事',
      fieldNotes: '现场笔记',
      view3dModel: '查看 3D 模型',
      loadingReviews: '正在加载信息...',
      noReviews: '暂无信息。',
      drivingView: '跟随视角',
      autoDriving: '自动导览',
      landmarkFocus: '地标聚焦',
      mapMode: '俯视视角',
      modelPreview: '3D 预览',
      close: '关闭',
      modelHint: '拖拽旋转 / 滚轮缩放',
    },
    landmarks: reviewsEn,
  },
  zh: {
    ui: {
      score: '评分',
      mapView: '俯视视角',
      cruise: '巡航',
      auto: '自动导览',
      view: '视角',
      explore: '探索',
      openSideBriefing: '打开侧边导览',
      cruiseAndDiscover: '沿路巡游，发现地标',
      routeBriefing: '路线简报',
      enterFocus: '进入聚焦',
      backToRoute: '返回路线',
      architecturalStory: '建筑叙事',
      fieldNotes: '现场笔记',
      view3dModel: '查看 3D 模型',
      loadingReviews: '正在加载信息...',
      noReviews: '暂无信息。',
      drivingView: '跟随视角',
      autoDriving: '自动导览',
      landmarkFocus: '地标聚焦',
      mapMode: '俯视视角',
      modelPreview: '3D 预览',
      close: '关闭',
      modelHint: '拖拽旋转 / 滚轮缩放',
    },
    landmarks: reviewsZh,
  },
};

export function getMockReviewPayload(landmarkId, language = 'en') {
  const reviews = reviewLocales[language]?.landmarks?.[landmarkId] ?? [];
  return {
    mode: 'mock',
    landmark_id: landmarkId,
    average_score: null,
    review_count: reviews.length,
    reviews,
  };
}


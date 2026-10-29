import { Router } from 'express';

export function publicRoutes() {
  const router = Router();
  router.get('/', (req, res) => res.render('landing', { title: 'Mỗi cuộc trò chuyện, một dấu ấn' }));
  router.get('/docs', (req, res) => res.render('docs', { title: 'Hướng dẫn sử dụng', pageStyle: 'guide' }));
  return router;
}

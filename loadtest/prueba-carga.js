import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '20s', target: 20 },
    { duration: '40s', target: 50 },
    { duration: '20s', target: 0 },
  ],
};

export default function () {
  const res = http.get('http://localhost:8080/');
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(0.2);
}

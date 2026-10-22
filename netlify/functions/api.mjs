import {productionStore} from '../../server/store.mjs';
import {makeHandler} from '../../server/http.mjs';
export default makeHandler(productionStore);
export const config={path:'/api/*'};

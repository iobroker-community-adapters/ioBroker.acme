"use strict";(self.webpackChunkiobroker_admin_component_telegram=self.webpackChunkiobroker_admin_component_telegram||[]).push([["src_bootstrap_jsx"],{81281:function(o,u,e){e.r(u);var r=e(4819),t=e.n(r),p=e(24470),P=e(25309),g=e(93109),a=e(94427),c=e(75606),f=e(15854),_=e.n(f),C=Object.defineProperty,M=Object.getPrototypeOf,h=Reflect.get,D=(m,n,s)=>n in m?C(m,n,{enumerable:!0,configurable:!0,writable:!0,value:s}):m[n]=s,I=(m,n,s)=>D(m,typeof n!="symbol"?n+"":n,s),A=(m,n,s)=>h(M(m),s,n),j=(m,n,s)=>new Promise((i,K)=>{var N=S=>{try{Z(s.next(S))}catch(B){K(B)}},J=S=>{try{Z(s.throw(S))}catch(B){K(B)}},Z=S=>S.done?i(S.value):Promise.resolve(S.value).then(N,J);Z((s=s.apply(m,n)).next())});const O={table:{minWidth:400},header:{fontSize:16,fontWeight:"bold"},ok:{color:"#0ba20b"},warn:{color:"#f57d1d"},error:{color:"#c42c3a"}};class R extends c.ConfigGeneric{constructor(n){super(n),I(this,"onCertsChanged",(s,i)=>{s==="system.certificates"&&i&&this.readData(i).catch(()=>{})}),this.state={collections:null}}componentDidMount(){return j(this,null,function*(){A(R.prototype,this,"componentDidMount").call(this),yield this.readData(),yield this.props.socket.subscribeObject("system.certificates",this.onCertsChanged)})}readData(n){return j(this,null,function*(){var s;let i=n||(yield this.props.socket.getObject("system.certificates"));(s=i==null?void 0:i.native)!=null&&s.collections?i=i.native.collections:i={},this.setState({collections:i})})}componentWillUnmount(){return j(this,null,function*(){yield this.props.socket.unsubscribeObject("system.certificates",this.onCertsChanged)})}renderItem(){return this.state.collections?t().createElement("div",{style:{width:"100%"}},t().createElement("h4",null,c.I18n.t("custom_acme_title")),t().createElement(a.TableContainer,{component:a.Paper,style:{width:"100%"}},t().createElement(a.Table,{style:{width:"100%"},size:"small"},t().createElement(a.TableHead,null,t().createElement(a.TableRow,null,t().createElement(a.TableCell,null,c.I18n.t("custom_acme_id")),t().createElement(a.TableCell,null,c.I18n.t("custom_acme_status")),t().createElement(a.TableCell,null,c.I18n.t("custom_acme_domains")),t().createElement(a.TableCell,null,c.I18n.t("custom_acme_staging")),t().createElement(a.TableCell,null,c.I18n.t("custom_acme_expires")),t().createElement(a.TableCell,null))),t().createElement(a.TableBody,null,Object.keys(this.state.collections).map(n=>{const s=this.state.collections[n];let i;return new Date(s.tsExpires).getTime()>Date.now()&&!s.staging?i=t().createElement("span",{style:O.ok},"OK"):new Date(s.tsExpires).getTime()<=Date.now()?i=t().createElement("span",{style:O.error},c.I18n.t("custom_acme_expired")):s.staging&&(i=t().createElement("span",{style:O.warn},c.I18n.t("custom_acme_staging"))),t().createElement(a.TableRow,{key:n,sx:{"&:last-child td, &:last-child th":{border:0}}},t().createElement(a.TableCell,{component:"th",scope:"row"},n),t().createElement(a.TableCell,null,i),t().createElement(a.TableCell,null,s.domains.join(", ")),t().createElement(a.TableCell,{style:s.staging?O.warn:void 0},s.staging?"\u2713":""),t().createElement(a.TableCell,{style:new Date(s.tsExpires).getTime()<Date.now()?O.error:void 0},new Date(s.tsExpires).toLocaleString()))}))))):t().createElement(a.LinearProgress,null)}}R.propTypes={socket:_().object.isRequired,themeType:_().string,themeName:_().string,style:_().object,data:_().object.isRequired,attr:_().string,schema:_().object,onError:_().func,onChange:_().func};var L=R,d=Object.defineProperty,l=Object.getOwnPropertySymbols,E=Object.prototype.hasOwnProperty,v=Object.prototype.propertyIsEnumerable,y=(m,n,s)=>n in m?d(m,n,{enumerable:!0,configurable:!0,writable:!0,value:s}):m[n]=s,x=(m,n)=>{for(var s in n||(n={}))E.call(n,s)&&y(m,s,n[s]);if(l)for(var s of l(n))v.call(n,s)&&y(m,s,n[s]);return m};const T={app:m=>({backgroundColor:m.palette.background.default,color:m.palette.text.primary,height:"100%"}),item:{padding:50,width:"100%"}};class W extends c.GenericApp{constructor(n){const s=x({},n);super(n,s),this.state={data:{myCustomAttribute:"red"},theme:this.createTheme()};const i={en:e(86443),de:e(19837),ru:e(50482),pt:e(65909),nl:e(43573),fr:e(86115),it:e(79399),es:e(55117),pl:e(28130),uk:e(17138),"zh-cn":e(58246)};c.I18n.setTranslations(i),c.I18n.setLanguage((navigator.language||navigator.userLanguage||"en").substring(0,2).toLowerCase())}render(){return this.state.loaded?t().createElement(P.Z,{injectFirst:!0},t().createElement(g.Z,{theme:this.state.theme},t().createElement(a.Box,{sx:T.app},t().createElement("div",{style:T.item},t().createElement(L,{socket:this.socket,themeType:this.state.themeType,themeName:this.state.themeName,attr:"myCustomAttribute",data:this.state.data,onError:()=>{},instance:0,schema:{name:"ConfigCustomAcmeSet/Components/AcmeComponent",type:"custom"},onChange:n=>this.setState({data:n})}))))):t().createElement(P.Z,{injectFirst:!0},t().createElement(g.Z,{theme:this.state.theme},t().createElement(c.Loader,{themeType:this.state.themeType})))}}var b=W;window.adapterName="adapter-component-template";const U=document.getElementById("root");(0,p.s)(U).render(t().createElement(t().StrictMode,null,t().createElement(b,{socket:{port:8081}})))},93109:function(o,u,e){e.d(u,{Z:function(){return M}});var r=e(87462),t=e(63366),p=e(4819),P=e.n(p),g=e(15854),a=e.n(g),c=e(86210),f=e(37207),_=e(67557);const C=["theme"];function M(h){let{theme:D}=h,I=(0,t.Z)(h,C);const A=D[f.Z];return(0,_.jsx)(c.Z,(0,r.Z)({},I,{themeId:A?f.Z:void 0,theme:A||D}))}},5457:function(o,u,e){var r=e(4819),t=e.n(r);const p=r.createContext(null);u.Z=p},66005:function(o,u,e){e.d(u,{Z:function(){return P}});var r=e(4819),t=e.n(r),p=e(5457);function P(){return r.useContext(p.Z)}},55838:function(o,u,e){e.d(u,{V:function(){return M}});var r=e(87462),t=e(63366),p=e(4819),P=e.n(p),g=e(15854),a=e.n(g),c=e(67557);const f=["value"],_=p.createContext();function C(h){let{value:D}=h,I=(0,t.Z)(h,f);return(0,c.jsx)(_.Provider,(0,r.Z)({value:D!=null?D:!0},I))}const M=()=>{const h=p.useContext(_);return h!=null?h:!1};u.Z=C},86210:function(o,u,e){e.d(u,{Z:function(){return L}});var r=e(87462),t=e(4819),p=e(15854),P=e(66005),g=e(5457),c=typeof Symbol=="function"&&Symbol.for?Symbol.for("mui.nested"):"__THEME_NESTED__",f=e(67557);function _(d,l){return typeof l=="function"?l(d):(0,r.Z)({},d,l)}function C(d){const{children:l,theme:E}=d,v=(0,P.Z)(),y=t.useMemo(()=>{const x=v===null?E:_(v,E);return x!=null&&(x[c]=v!==null),x},[E,v]);return(0,f.jsx)(g.Z.Provider,{value:y,children:l})}var M=C,h=e(569),D=e(50384),I=e(55838),A=e(8592);const j={};function O(d,l,E,v=!1){return t.useMemo(()=>{const y=d&&l[d]||l;if(typeof E=="function"){const x=E(y),T=d?(0,r.Z)({},l,{[d]:x}):x;return v?()=>T:T}return d?(0,r.Z)({},l,{[d]:E}):(0,r.Z)({},l,E)},[d,l,E,v])}function R(d){const{children:l,theme:E,themeId:v}=d,y=(0,D.Z)(j),x=(0,P.Z)()||j,T=O(v,y,E),W=O(v,x,E,!0),b=T.direction==="rtl";return(0,f.jsx)(M,{theme:W,children:(0,f.jsx)(h.T.Provider,{value:T,children:(0,f.jsx)(I.Z,{value:b,children:(0,f.jsx)(A.Z,{value:T==null?void 0:T.components,children:l})})})})}var L=R},50384:function(o,u,e){var r=e(4819),t=e.n(r),p=e(569);function P(a){return Object.keys(a).length===0}function g(a=null){const c=r.useContext(p.T);return!c||P(c)?a:c}u.Z=g},24470:function(o,u,e){var r,t=e(77440);if(1)u.s=t.createRoot,r=t.hydrateRoot;else var p},19837:function(o){o.exports=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"Status","custom_acme_title":"Status der Sammlungen","custom_acme_domains":"Dom\xE4nen","custom_acme_staging":"Testumgebung","custom_acme_expires":"L\xE4uft ab","custom_acme_expired":"Abgelaufen"}')},86443:function(o){o.exports=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"Status","custom_acme_title":"Status of the collections","custom_acme_domains":"Domains","custom_acme_staging":"Test-Environment","custom_acme_expires":"Expires","custom_acme_expired":"expired"}')},55117:function(o){o.exports=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"Estado","custom_acme_title":"Estado de las colecciones","custom_acme_domains":"Dominios","custom_acme_staging":"Prueba","custom_acme_expires":"Caduca","custom_acme_expired":"venci\xF3"}')},86115:function(o){o.exports=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"Statut","custom_acme_title":"\xC9tat des collections","custom_acme_domains":"Domaines","custom_acme_staging":"Test","custom_acme_expires":"Expire","custom_acme_expired":"expir\xE9"}')},79399:function(o){o.exports=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"Stato","custom_acme_title":"Stato delle collezioni","custom_acme_domains":"Domini","custom_acme_staging":"Test","custom_acme_expires":"Scade","custom_acme_expired":"scaduto"}')},43573:function(o){o.exports=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"Toestand","custom_acme_title":"Status van de collecties","custom_acme_domains":"Domeinen","custom_acme_staging":"Test","custom_acme_expires":"Verloopt","custom_acme_expired":"verlopen"}')},28130:function(o){o.exports=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"Status","custom_acme_title":"Stan zbior\xF3w","custom_acme_domains":"Domeny","custom_acme_staging":"Test","custom_acme_expires":"Wygasa","custom_acme_expired":"wygas\u0142y"}')},65909:function(o){o.exports=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"Status","custom_acme_title":"Estado das cole\xE7\xF5es","custom_acme_domains":"dom\xEDnios","custom_acme_staging":"Teste","custom_acme_expires":"Expira","custom_acme_expired":"expirado"}')},50482:function(o){o.exports=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"\u0421\u0442\u0430\u0442\u0443\u0441","custom_acme_title":"\u0421\u0442\u0430\u0442\u0443\u0441 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0439","custom_acme_domains":"\u0414\u043E\u043C\u0435\u043D\u044B","custom_acme_staging":"\u0422\u0435\u0441\u0442","custom_acme_expires":"\u0418\u0441\u0442\u0435\u043A\u0430\u0435\u0442","custom_acme_expired":"\u0438\u0441\u0442\u0435\u043A\u0448\u0438\u0439"}')},17138:function(o){o.exports=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"\u0421\u0442\u0430\u0442\u0443\u0441","custom_acme_title":"\u0421\u0442\u0430\u043D \u043A\u043E\u043B\u0435\u043A\u0446\u0456\u0439","custom_acme_domains":"\u0414\u043E\u043C\u0435\u043D\u0438","custom_acme_staging":"\u0422\u0435\u0441\u0442","custom_acme_expires":"\u0422\u0435\u0440\u043C\u0456\u043D \u0434\u0456\u0457 \u0437\u0430\u043A\u0456\u043D\u0447\u0443\u0454\u0442\u044C\u0441\u044F","custom_acme_expired":"\u0437\u0430\u043A\u0456\u043D\u0447\u0438\u0432\u0441\u044F"}')},58246:function(o){o.exports=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"\u5730\u4F4D","custom_acme_title":"\u9986\u85CF\u72B6\u51B5","custom_acme_domains":"\u57DF","custom_acme_staging":"\u6D4B\u8BD5","custom_acme_expires":"\u8FC7\u671F","custom_acme_expired":"\u5DF2\u5230\u671F"}')}}]);

//# sourceMappingURL=src_bootstrap_jsx.71ad7b48.chunk.js.map
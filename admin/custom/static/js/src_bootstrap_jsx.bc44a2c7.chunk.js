"use strict";(self.webpackChunkiobroker_admin_component_acme=self.webpackChunkiobroker_admin_component_acme||[]).push([["src_bootstrap_jsx"],{5868:($,q,m)=>{var E=m(8437),s=m.n(E),v=m(4140),h=m(8700),g=m(3821),c=m(7085),n=m(5636);const O=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"Status","custom_acme_title":"Status of the collections","custom_acme_domains":"Domains","custom_acme_staging":"Test-Environment","custom_acme_expires":"Expires","custom_acme_expired":"expired"}'),T=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"Status","custom_acme_title":"Status der Sammlungen","custom_acme_domains":"Dom\xE4nen","custom_acme_staging":"Testumgebung","custom_acme_expires":"L\xE4uft ab","custom_acme_expired":"Abgelaufen"}'),C=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"\u0421\u0442\u0430\u0442\u0443\u0441","custom_acme_title":"\u0421\u0442\u0430\u0442\u0443\u0441 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0439","custom_acme_domains":"\u0414\u043E\u043C\u0435\u043D\u044B","custom_acme_staging":"\u0422\u0435\u0441\u0442","custom_acme_expires":"\u0418\u0441\u0442\u0435\u043A\u0430\u0435\u0442","custom_acme_expired":"\u0438\u0441\u0442\u0435\u043A\u0448\u0438\u0439"}'),j=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"Status","custom_acme_title":"Estado das cole\xE7\xF5es","custom_acme_domains":"dom\xEDnios","custom_acme_staging":"Teste","custom_acme_expires":"Expira","custom_acme_expired":"expirado"}'),S=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"Toestand","custom_acme_title":"Status van de collecties","custom_acme_domains":"Domeinen","custom_acme_staging":"Test","custom_acme_expires":"Verloopt","custom_acme_expired":"verlopen"}'),D=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"Statut","custom_acme_title":"\xC9tat des collections","custom_acme_domains":"Domaines","custom_acme_staging":"Test","custom_acme_expires":"Expire","custom_acme_expired":"expir\xE9"}'),w=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"Stato","custom_acme_title":"Stato delle collezioni","custom_acme_domains":"Domini","custom_acme_staging":"Test","custom_acme_expires":"Scade","custom_acme_expired":"scaduto"}'),I=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"Estado","custom_acme_title":"Estado de las colecciones","custom_acme_domains":"Dominios","custom_acme_staging":"Prueba","custom_acme_expires":"Caduca","custom_acme_expired":"venci\xF3"}'),P=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"Status","custom_acme_title":"Stan zbior\xF3w","custom_acme_domains":"Domeny","custom_acme_staging":"Test","custom_acme_expires":"Wygasa","custom_acme_expired":"wygas\u0142y"}'),N=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"\u0421\u0442\u0430\u0442\u0443\u0441","custom_acme_title":"\u0421\u0442\u0430\u043D \u043A\u043E\u043B\u0435\u043A\u0446\u0456\u0439","custom_acme_domains":"\u0414\u043E\u043C\u0435\u043D\u0438","custom_acme_staging":"\u0422\u0435\u0441\u0442","custom_acme_expires":"\u0422\u0435\u0440\u043C\u0456\u043D \u0434\u0456\u0457 \u0437\u0430\u043A\u0456\u043D\u0447\u0443\u0454\u0442\u044C\u0441\u044F","custom_acme_expired":"\u0437\u0430\u043A\u0456\u043D\u0447\u0438\u0432\u0441\u044F"}'),A=JSON.parse('{"custom_acme_id":"ID","custom_acme_status":"\u5730\u4F4D","custom_acme_title":"\u9986\u85CF\u72B6\u51B5","custom_acme_domains":"\u57DF","custom_acme_staging":"\u6D4B\u8BD5","custom_acme_expires":"\u8FC7\u671F","custom_acme_expired":"\u5DF2\u5230\u671F"}');var k=m(5973),r=m.n(k),J=m(556),L=Object.defineProperty,z=Object.getPrototypeOf,R=Reflect.get,G=(a,t,e)=>t in a?L(a,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):a[t]=e,W=(a,t,e)=>G(a,typeof t!="symbol"?t+"":t,e),B=(a,t,e)=>R(z(a),e,t),u=(a,t,e)=>new Promise((o,y)=>{var Y=i=>{try{p(e.next(i))}catch(d){y(d)}},Z=i=>{try{p(e.throw(i))}catch(d){y(d)}},p=i=>i.done?o(i.value):Promise.resolve(i.value).then(Y,Z);p((e=e.apply(a,t)).next())});const l={table:{minWidth:400},header:{fontSize:16,fontWeight:"bold"},ok:{color:"#0ba20b"},warn:{color:"#f57d1d"},error:{color:"#c42c3a"}};class _ extends J.ConfigGeneric{constructor(t){super(t),W(this,"onCertsChanged",(e,o)=>{e==="system.certificates"&&o&&this.readData(o).catch(()=>{})}),this.socket=this.props.oContext?this.props.oContext.socket:this.props.socket,Object.assign(this.state,{collections:null})}componentDidMount(){return u(this,null,function*(){B(_.prototype,this,"componentDidMount").call(this),yield this.readData(),yield this.socket.subscribeObject("system.certificates",this.onCertsChanged)})}readData(t){return u(this,null,function*(){var e;let o=t||(yield this.socket.getObject("system.certificates"));(e=o==null?void 0:o.native)!=null&&e.collections?o=o.native.collections:o={},this.setState({collections:o})})}componentWillUnmount(){return u(this,null,function*(){yield this.socket.unsubscribeObject("system.certificates",this.onCertsChanged)})}renderItem(){return this.state.collections?s().createElement("div",{style:{width:"100%"}},s().createElement("h4",null,n.I18n.t("custom_acme_title")),s().createElement(c.TableContainer,{component:c.Paper,style:{width:"100%"}},s().createElement(c.Table,{style:{width:"100%"},size:"small"},s().createElement(c.TableHead,null,s().createElement(c.TableRow,null,s().createElement(c.TableCell,null,n.I18n.t("custom_acme_id")),s().createElement(c.TableCell,null,n.I18n.t("custom_acme_status")),s().createElement(c.TableCell,null,n.I18n.t("custom_acme_domains")),s().createElement(c.TableCell,null,n.I18n.t("custom_acme_staging")),s().createElement(c.TableCell,null,n.I18n.t("custom_acme_expires")),s().createElement(c.TableCell,null))),s().createElement(c.TableBody,null,Object.keys(this.state.collections).map(t=>{const e=this.state.collections[t];let o;return new Date(e.tsExpires).getTime()>Date.now()&&!e.staging?o=s().createElement("span",{style:l.ok},"OK"):new Date(e.tsExpires).getTime()<=Date.now()?o=s().createElement("span",{style:l.error},n.I18n.t("custom_acme_expired")):e.staging&&(o=s().createElement("span",{style:l.warn},n.I18n.t("custom_acme_staging"))),s().createElement(c.TableRow,{key:t,sx:{"&:last-child td, &:last-child th":{border:0}}},s().createElement(c.TableCell,{component:"th",scope:"row"},t),s().createElement(c.TableCell,null,o),s().createElement(c.TableCell,null,e.domains.join(", ")),s().createElement(c.TableCell,{style:e.staging?l.warn:void 0},e.staging?"\u2713":""),s().createElement(c.TableCell,{style:new Date(e.tsExpires).getTime()<Date.now()?l.error:void 0},new Date(e.tsExpires).toLocaleString()))}))))):s().createElement(c.LinearProgress,null)}}_.propTypes={socket:r().object,oContext:r().object.isRequired,themeType:r().string,themeName:r().string,style:r().object,data:r().object.isRequired,attr:r().string,schema:r().object,onError:r().func,onChange:r().func};const F=_;var M=Object.defineProperty,b=Object.getOwnPropertySymbols,V=Object.prototype.hasOwnProperty,H=Object.prototype.propertyIsEnumerable,f=(a,t,e)=>t in a?M(a,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):a[t]=e,K=(a,t)=>{for(var e in t||(t={}))V.call(t,e)&&f(a,e,t[e]);if(b)for(var e of b(t))H.call(t,e)&&f(a,e,t[e]);return a};const x={app:a=>({backgroundColor:a.palette.background.default,color:a.palette.text.primary,height:"100%"}),item:{padding:50,width:"100%"}};class U extends n.GenericApp{constructor(t){const e=K({},t);super(t,e),this.state={data:{myCustomAttribute:"red"},theme:this.createTheme()};const o={en:O,de:T,ru:C,pt:j,nl:S,fr:D,it:w,es:I,pl:P,uk:N,"zh-cn":A};n.I18n.setTranslations(o),n.I18n.setLanguage((navigator.language||navigator.userLanguage||"en").substring(0,2).toLowerCase())}render(){return this.state.loaded?s().createElement(h.A,{injectFirst:!0},s().createElement(g.A,{theme:this.state.theme},s().createElement(c.Box,{sx:x.app},s().createElement("div",{style:x.item},s().createElement(F,{socket:this.socket,themeType:this.state.themeType,themeName:this.state.themeName,attr:"myCustomAttribute",data:this.state.data,onError:()=>{},instance:0,schema:{name:"ConfigCustomAcmeSet/Components/AcmeComponent",type:"custom"},onChange:t=>this.setState({data:t})}))))):s().createElement(h.A,{injectFirst:!0},s().createElement(g.A,{theme:this.state.theme},s().createElement(n.Loader,{themeType:this.state.themeType})))}}const Q=U;window.adapterName="adapter-component-template";const X=document.getElementById("root");(0,v.createRoot)(X).render(s().createElement(s().StrictMode,null,s().createElement(Q,{socket:{port:8081}})))}}]);

//# sourceMappingURL=src_bootstrap_jsx.bc44a2c7.chunk.js.map
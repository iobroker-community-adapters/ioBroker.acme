"use strict";(self.webpackChunkiobroker_admin_component_acme=self.webpackChunkiobroker_admin_component_acme||[]).push([["src_Components_jsx"],{89259:(I,b,o)=>{o.r(b),o.d(b,{default:()=>w});var g=o(28437),t=o.n(g),y=o(95973),a=o.n(y),n=o(81270),r=o(75636),C=o(60556),E=Object.defineProperty,v=Object.getPrototypeOf,T=Reflect.get,_=(c,l,e)=>l in c?E(c,l,{enumerable:!0,configurable:!0,writable:!0,value:e}):c[l]=e,j=(c,l,e)=>_(c,typeof l!="symbol"?l+"":l,e),x=(c,l,e)=>T(v(c),e,l),d=(c,l,e)=>new Promise((s,f)=>{var D=i=>{try{h(e.next(i))}catch(p){f(p)}},O=i=>{try{h(e.throw(i))}catch(p){f(p)}},h=i=>i.done?s(i.value):Promise.resolve(i.value).then(D,O);h((e=e.apply(c,l)).next())});const m={table:{minWidth:400},header:{fontSize:16,fontWeight:"bold"},ok:{color:"#0ba20b"},warn:{color:"#f57d1d"},error:{color:"#c42c3a"}};class u extends C.ConfigGeneric{constructor(l){super(l),j(this,"onCertsChanged",(e,s)=>{e==="system.certificates"&&s&&this.readData(s).catch(()=>{})}),this.socket=this.props.oContext?this.props.oContext.socket:this.props.socket,Object.assign(this.state,{collections:null})}componentDidMount(){return d(this,null,function*(){x(u.prototype,this,"componentDidMount").call(this),yield this.readData(),yield this.socket.subscribeObject("system.certificates",this.onCertsChanged)})}readData(l){return d(this,null,function*(){var e;let s=l||(yield this.socket.getObject("system.certificates"));(e=s==null?void 0:s.native)!=null&&e.collections?s=s.native.collections:s={},this.setState({collections:s})})}componentWillUnmount(){return d(this,null,function*(){yield this.socket.unsubscribeObject("system.certificates",this.onCertsChanged)})}renderItem(){return this.state.collections?t().createElement("div",{style:{width:"100%"}},t().createElement("h4",null,r.I18n.t("custom_acme_title")),t().createElement(n.TableContainer,{component:n.Paper,style:{width:"100%"}},t().createElement(n.Table,{style:{width:"100%"},size:"small"},t().createElement(n.TableHead,null,t().createElement(n.TableRow,null,t().createElement(n.TableCell,null,r.I18n.t("custom_acme_id")),t().createElement(n.TableCell,null,r.I18n.t("custom_acme_status")),t().createElement(n.TableCell,null,r.I18n.t("custom_acme_domains")),t().createElement(n.TableCell,null,r.I18n.t("custom_acme_staging")),t().createElement(n.TableCell,null,r.I18n.t("custom_acme_expires")),t().createElement(n.TableCell,null))),t().createElement(n.TableBody,null,Object.keys(this.state.collections).map(l=>{const e=this.state.collections[l];let s;return new Date(e.tsExpires).getTime()>Date.now()&&!e.staging?s=t().createElement("span",{style:m.ok},"OK"):new Date(e.tsExpires).getTime()<=Date.now()?s=t().createElement("span",{style:m.error},r.I18n.t("custom_acme_expired")):e.staging&&(s=t().createElement("span",{style:m.warn},r.I18n.t("custom_acme_staging"))),t().createElement(n.TableRow,{key:l,sx:{"&:last-child td, &:last-child th":{border:0}}},t().createElement(n.TableCell,{component:"th",scope:"row"},l),t().createElement(n.TableCell,null,s),t().createElement(n.TableCell,null,e.domains.join(", ")),t().createElement(n.TableCell,{style:e.staging?m.warn:void 0},e.staging?"\u2713":""),t().createElement(n.TableCell,{style:new Date(e.tsExpires).getTime()<Date.now()?m.error:void 0},new Date(e.tsExpires).toLocaleString()))}))))):t().createElement(n.LinearProgress,null)}}u.propTypes={socket:a().object,oContext:a().object.isRequired,themeType:a().string,themeName:a().string,style:a().object,data:a().object.isRequired,attr:a().string,schema:a().object,onError:a().func,onChange:a().func};const w={AcmeComponent:u}}}]);

//# sourceMappingURL=src_Components_jsx.e86e5b95.chunk.js.map
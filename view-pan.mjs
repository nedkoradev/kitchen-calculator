import {decorateAction} from './icons.mjs';
// A screen-space adapter for the SAME OrbitControls camera and target.
export function installViewPan({THREE,controls,host,onCenter}){
 const root=document.createElement('div');root.id='viewPanControls';root.setAttribute('aria-label','Преместване на изгледа');
 const origin=controls.target.clone(),right=new THREE.Vector3(),up=new THREE.Vector3(),offset=new THREE.Vector3();
 const inputs={};
 for(const [axis,label] of [['x','Изглед наляво и надясно'],['y','Изглед нагоре и надолу']]){const input=document.createElement('input');input.type='range';input.id='viewPan'+axis.toUpperCase();input.min=-1000;input.max=1000;input.step='any';input.value=0;input.setAttribute('aria-label',label);input.title=label;if(axis==='y')input.setAttribute('aria-orientation','vertical');root.append(input);inputs[axis]=input}
 const center=document.createElement('button');center.type='button';center.id='viewPanCenter';decorateAction(center,'refresh','Центрирай изгледа',{iconOnly:true});center.onclick=()=>{finishMotion();onCenter()};root.append(center);host.append(root);
 function finishMotion(){const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping}
 function basis(){const camera=controls.object;camera.updateMatrixWorld();right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);const height=camera.isOrthographicCamera?(camera.top-camera.bottom)/camera.zoom:2*camera.position.distanceTo(controls.target)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2));const width=camera.isOrthographicCamera?(camera.right-camera.left)/camera.zoom:height*camera.aspect;return {x:Math.max(1,width)/500,y:Math.max(1,height)/500}}
 function sync(){if(!host.clientWidth||!host.clientHeight)return;const scale=basis();offset.copy(controls.target).sub(origin);for(const axis of ['x','y']){const input=inputs[axis],value=offset.dot(axis==='x'?right:up)/scale[axis];const range=Math.max(1000,Math.ceil(Math.abs(value)/1000)*1000);if(Math.abs(value)>Number(input.max)){input.min=-range;input.max=range}input.value=value;input.setAttribute('aria-valuetext',Math.round(offset.dot(axis==='x'?right:up))+' мм')}}
 for(const axis of ['x','y']){
  inputs[axis].addEventListener('pointerdown',finishMotion);
  inputs[axis].addEventListener('input',()=>{const wanted=Number(inputs[axis].value);finishMotion();const scale=basis(),direction=axis==='x'?right:up;offset.copy(controls.target).sub(origin);const distance=wanted*scale[axis]-offset.dot(direction);const movement=direction.clone().multiplyScalar(distance);controls.object.position.add(movement);controls.target.add(movement);controls.update();sync()});
 }
 root.addEventListener('keydown',event=>event.stopPropagation());controls.addEventListener('change',sync);const observer=new ResizeObserver(sync);observer.observe(host);sync();
 return {resetOrigin(point){origin.copy(point);for(const input of Object.values(inputs)){input.min=-1000;input.max=1000}sync()}};
}

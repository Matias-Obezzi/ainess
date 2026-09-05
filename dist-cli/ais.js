import { parseArgs } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import * as readline from "node:readline";
import * as os from "node:os";
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
//#region node_modules/zustand/esm/vanilla.mjs
var createStoreImpl = (createState) => {
	let state;
	const listeners = /* @__PURE__ */ new Set();
	const setState = (partial, replace) => {
		const nextState = typeof partial === "function" ? partial(state) : partial;
		if (!Object.is(nextState, state)) {
			const previousState = state;
			state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
			listeners.forEach((listener) => listener(state, previousState));
		}
	};
	const getState = () => state;
	const getInitialState = () => initialState;
	const subscribe = (listener) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};
	const api = {
		setState,
		getState,
		getInitialState,
		subscribe
	};
	const initialState = state = createState(setState, getState, api);
	return api;
};
var createStore = ((createState) => createState ? createStoreImpl(createState) : createStoreImpl);
//#endregion
//#region node_modules/react/cjs/react.production.js
/**
* @license React
* react.production.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_production = /* @__PURE__ */ __commonJSMin(((exports) => {
	var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
	var REACT_PORTAL_TYPE = Symbol.for("react.portal");
	var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
	var REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
	var REACT_PROFILER_TYPE = Symbol.for("react.profiler");
	var REACT_CONSUMER_TYPE = Symbol.for("react.consumer");
	var REACT_CONTEXT_TYPE = Symbol.for("react.context");
	var REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
	var REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
	var REACT_MEMO_TYPE = Symbol.for("react.memo");
	var REACT_LAZY_TYPE = Symbol.for("react.lazy");
	var REACT_ACTIVITY_TYPE = Symbol.for("react.activity");
	var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
	function getIteratorFn(maybeIterable) {
		if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
		maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
		return "function" === typeof maybeIterable ? maybeIterable : null;
	}
	var ReactNoopUpdateQueue = {
		isMounted: function() {
			return !1;
		},
		enqueueForceUpdate: function() {},
		enqueueReplaceState: function() {},
		enqueueSetState: function() {}
	};
	var assign = Object.assign;
	var emptyObject = {};
	function Component(props, context, updater) {
		this.props = props;
		this.context = context;
		this.refs = emptyObject;
		this.updater = updater || ReactNoopUpdateQueue;
	}
	Component.prototype.isReactComponent = {};
	Component.prototype.setState = function(partialState, callback) {
		if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
		this.updater.enqueueSetState(this, partialState, callback, "setState");
	};
	Component.prototype.forceUpdate = function(callback) {
		this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
	};
	function ComponentDummy() {}
	ComponentDummy.prototype = Component.prototype;
	function PureComponent(props, context, updater) {
		this.props = props;
		this.context = context;
		this.refs = emptyObject;
		this.updater = updater || ReactNoopUpdateQueue;
	}
	var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
	pureComponentPrototype.constructor = PureComponent;
	assign(pureComponentPrototype, Component.prototype);
	pureComponentPrototype.isPureReactComponent = !0;
	var isArrayImpl = Array.isArray;
	function noop() {}
	var ReactSharedInternals = {
		H: null,
		A: null,
		T: null,
		S: null
	};
	var hasOwnProperty = Object.prototype.hasOwnProperty;
	function ReactElement(type, key, props) {
		var refProp = props.ref;
		return {
			$$typeof: REACT_ELEMENT_TYPE,
			type,
			key,
			ref: void 0 !== refProp ? refProp : null,
			props
		};
	}
	function cloneAndReplaceKey(oldElement, newKey) {
		return ReactElement(oldElement.type, newKey, oldElement.props);
	}
	function isValidElement(object) {
		return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
	}
	function escape(key) {
		var escaperLookup = {
			"=": "=0",
			":": "=2"
		};
		return "$" + key.replace(/[=:]/g, function(match) {
			return escaperLookup[match];
		});
	}
	var userProvidedKeyEscapeRegex = /\/+/g;
	function getElementKey(element, index) {
		return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
	}
	function resolveThenable(thenable) {
		switch (thenable.status) {
			case "fulfilled": return thenable.value;
			case "rejected": throw thenable.reason;
			default: switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(function(fulfilledValue) {
				"pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
			}, function(error) {
				"pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
			})), thenable.status) {
				case "fulfilled": return thenable.value;
				case "rejected": throw thenable.reason;
			}
		}
		throw thenable;
	}
	function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
		var type = typeof children;
		if ("undefined" === type || "boolean" === type) children = null;
		var invokeCallback = !1;
		if (null === children) invokeCallback = !0;
		else switch (type) {
			case "bigint":
			case "string":
			case "number":
				invokeCallback = !0;
				break;
			case "object": switch (children.$$typeof) {
				case REACT_ELEMENT_TYPE:
				case REACT_PORTAL_TYPE:
					invokeCallback = !0;
					break;
				case REACT_LAZY_TYPE: return invokeCallback = children._init, mapIntoArray(invokeCallback(children._payload), array, escapedPrefix, nameSoFar, callback);
			}
		}
		if (invokeCallback) return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
			return c;
		})) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(callback, escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(userProvidedKeyEscapeRegex, "$&/") + "/") + invokeCallback)), array.push(callback)), 1;
		invokeCallback = 0;
		var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
		if (isArrayImpl(children)) for (var i = 0; i < children.length; i++) nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
		else if (i = getIteratorFn(children), "function" === typeof i) for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done;) nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
		else if ("object" === type) {
			if ("function" === typeof children.then) return mapIntoArray(resolveThenable(children), array, escapedPrefix, nameSoFar, callback);
			array = String(children);
			throw Error("Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead.");
		}
		return invokeCallback;
	}
	function mapChildren(children, func, context) {
		if (null == children) return children;
		var result = [], count = 0;
		mapIntoArray(children, result, "", "", function(child) {
			return func.call(context, child, count++);
		});
		return result;
	}
	function lazyInitializer(payload) {
		if (-1 === payload._status) {
			var ctor = payload._result;
			ctor = ctor();
			ctor.then(function(moduleObject) {
				if (0 === payload._status || -1 === payload._status) payload._status = 1, payload._result = moduleObject;
			}, function(error) {
				if (0 === payload._status || -1 === payload._status) payload._status = 2, payload._result = error;
			});
			-1 === payload._status && (payload._status = 0, payload._result = ctor);
		}
		if (1 === payload._status) return payload._result.default;
		throw payload._result;
	}
	var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
		if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
			var event = new window.ErrorEvent("error", {
				bubbles: !0,
				cancelable: !0,
				message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
				error
			});
			if (!window.dispatchEvent(event)) return;
		} else if ("object" === typeof process && "function" === typeof process.emit) {
			process.emit("uncaughtException", error);
			return;
		}
		console.error(error);
	};
	var Children = {
		map: mapChildren,
		forEach: function(children, forEachFunc, forEachContext) {
			mapChildren(children, function() {
				forEachFunc.apply(this, arguments);
			}, forEachContext);
		},
		count: function(children) {
			var n = 0;
			mapChildren(children, function() {
				n++;
			});
			return n;
		},
		toArray: function(children) {
			return mapChildren(children, function(child) {
				return child;
			}) || [];
		},
		only: function(children) {
			if (!isValidElement(children)) throw Error("React.Children.only expected to receive a single React element child.");
			return children;
		}
	};
	exports.Activity = REACT_ACTIVITY_TYPE;
	exports.Children = Children;
	exports.Component = Component;
	exports.Fragment = REACT_FRAGMENT_TYPE;
	exports.Profiler = REACT_PROFILER_TYPE;
	exports.PureComponent = PureComponent;
	exports.StrictMode = REACT_STRICT_MODE_TYPE;
	exports.Suspense = REACT_SUSPENSE_TYPE;
	exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
	exports.__COMPILER_RUNTIME = {
		__proto__: null,
		c: function(size) {
			return ReactSharedInternals.H.useMemoCache(size);
		}
	};
	exports.cache = function(fn) {
		return function() {
			return fn.apply(null, arguments);
		};
	};
	exports.cacheSignal = function() {
		return null;
	};
	exports.cloneElement = function(element, config, children) {
		if (null === element || void 0 === element) throw Error("The argument must be a React element, but you passed " + element + ".");
		var props = assign({}, element.props), key = element.key;
		if (null != config) for (propName in void 0 !== config.key && (key = "" + config.key), config) !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
		var propName = arguments.length - 2;
		if (1 === propName) props.children = children;
		else if (1 < propName) {
			for (var childArray = Array(propName), i = 0; i < propName; i++) childArray[i] = arguments[i + 2];
			props.children = childArray;
		}
		return ReactElement(element.type, key, props);
	};
	exports.createContext = function(defaultValue) {
		defaultValue = {
			$$typeof: REACT_CONTEXT_TYPE,
			_currentValue: defaultValue,
			_currentValue2: defaultValue,
			_threadCount: 0,
			Provider: null,
			Consumer: null
		};
		defaultValue.Provider = defaultValue;
		defaultValue.Consumer = {
			$$typeof: REACT_CONSUMER_TYPE,
			_context: defaultValue
		};
		return defaultValue;
	};
	exports.createElement = function(type, config, children) {
		var propName, props = {}, key = null;
		if (null != config) for (propName in void 0 !== config.key && (key = "" + config.key), config) hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config[propName]);
		var childrenLength = arguments.length - 2;
		if (1 === childrenLength) props.children = children;
		else if (1 < childrenLength) {
			for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++) childArray[i] = arguments[i + 2];
			props.children = childArray;
		}
		if (type && type.defaultProps) for (propName in childrenLength = type.defaultProps, childrenLength) void 0 === props[propName] && (props[propName] = childrenLength[propName]);
		return ReactElement(type, key, props);
	};
	exports.createRef = function() {
		return { current: null };
	};
	exports.forwardRef = function(render) {
		return {
			$$typeof: REACT_FORWARD_REF_TYPE,
			render
		};
	};
	exports.isValidElement = isValidElement;
	exports.lazy = function(ctor) {
		return {
			$$typeof: REACT_LAZY_TYPE,
			_payload: {
				_status: -1,
				_result: ctor
			},
			_init: lazyInitializer
		};
	};
	exports.memo = function(type, compare) {
		return {
			$$typeof: REACT_MEMO_TYPE,
			type,
			compare: void 0 === compare ? null : compare
		};
	};
	exports.startTransition = function(scope) {
		var prevTransition = ReactSharedInternals.T, currentTransition = {};
		ReactSharedInternals.T = currentTransition;
		try {
			var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
			null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
			"object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
		} catch (error) {
			reportGlobalError(error);
		} finally {
			null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
		}
	};
	exports.unstable_useCacheRefresh = function() {
		return ReactSharedInternals.H.useCacheRefresh();
	};
	exports.use = function(usable) {
		return ReactSharedInternals.H.use(usable);
	};
	exports.useActionState = function(action, initialState, permalink) {
		return ReactSharedInternals.H.useActionState(action, initialState, permalink);
	};
	exports.useCallback = function(callback, deps) {
		return ReactSharedInternals.H.useCallback(callback, deps);
	};
	exports.useContext = function(Context) {
		return ReactSharedInternals.H.useContext(Context);
	};
	exports.useDebugValue = function() {};
	exports.useDeferredValue = function(value, initialValue) {
		return ReactSharedInternals.H.useDeferredValue(value, initialValue);
	};
	exports.useEffect = function(create, deps) {
		return ReactSharedInternals.H.useEffect(create, deps);
	};
	exports.useEffectEvent = function(callback) {
		return ReactSharedInternals.H.useEffectEvent(callback);
	};
	exports.useId = function() {
		return ReactSharedInternals.H.useId();
	};
	exports.useImperativeHandle = function(ref, create, deps) {
		return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
	};
	exports.useInsertionEffect = function(create, deps) {
		return ReactSharedInternals.H.useInsertionEffect(create, deps);
	};
	exports.useLayoutEffect = function(create, deps) {
		return ReactSharedInternals.H.useLayoutEffect(create, deps);
	};
	exports.useMemo = function(create, deps) {
		return ReactSharedInternals.H.useMemo(create, deps);
	};
	exports.useOptimistic = function(passthrough, reducer) {
		return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
	};
	exports.useReducer = function(reducer, initialArg, init) {
		return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
	};
	exports.useRef = function(initialValue) {
		return ReactSharedInternals.H.useRef(initialValue);
	};
	exports.useState = function(initialState) {
		return ReactSharedInternals.H.useState(initialState);
	};
	exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
		return ReactSharedInternals.H.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	};
	exports.useTransition = function() {
		return ReactSharedInternals.H.useTransition();
	};
	exports.version = "19.2.8";
}));
//#endregion
//#region node_modules/react/cjs/react.development.js
/**
* @license React
* react.development.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_development = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	"production" !== process.env.NODE_ENV && (function() {
		function defineDeprecationWarning(methodName, info) {
			Object.defineProperty(Component.prototype, methodName, { get: function() {
				console.warn("%s(...) is deprecated in plain JavaScript React classes. %s", info[0], info[1]);
			} });
		}
		function getIteratorFn(maybeIterable) {
			if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
			maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
			return "function" === typeof maybeIterable ? maybeIterable : null;
		}
		function warnNoop(publicInstance, callerName) {
			publicInstance = (publicInstance = publicInstance.constructor) && (publicInstance.displayName || publicInstance.name) || "ReactClass";
			var warningKey = publicInstance + "." + callerName;
			didWarnStateUpdateForUnmountedComponent[warningKey] || (console.error("Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.", callerName, publicInstance), didWarnStateUpdateForUnmountedComponent[warningKey] = !0);
		}
		function Component(props, context, updater) {
			this.props = props;
			this.context = context;
			this.refs = emptyObject;
			this.updater = updater || ReactNoopUpdateQueue;
		}
		function ComponentDummy() {}
		function PureComponent(props, context, updater) {
			this.props = props;
			this.context = context;
			this.refs = emptyObject;
			this.updater = updater || ReactNoopUpdateQueue;
		}
		function noop() {}
		function testStringCoercion(value) {
			return "" + value;
		}
		function checkKeyStringCoercion(value) {
			try {
				testStringCoercion(value);
				var JSCompiler_inline_result = !1;
			} catch (e) {
				JSCompiler_inline_result = !0;
			}
			if (JSCompiler_inline_result) {
				JSCompiler_inline_result = console;
				var JSCompiler_temp_const = JSCompiler_inline_result.error;
				var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
				JSCompiler_temp_const.call(JSCompiler_inline_result, "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.", JSCompiler_inline_result$jscomp$0);
				return testStringCoercion(value);
			}
		}
		function getComponentNameFromType(type) {
			if (null == type) return null;
			if ("function" === typeof type) return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
			if ("string" === typeof type) return type;
			switch (type) {
				case REACT_FRAGMENT_TYPE: return "Fragment";
				case REACT_PROFILER_TYPE: return "Profiler";
				case REACT_STRICT_MODE_TYPE: return "StrictMode";
				case REACT_SUSPENSE_TYPE: return "Suspense";
				case REACT_SUSPENSE_LIST_TYPE: return "SuspenseList";
				case REACT_ACTIVITY_TYPE: return "Activity";
			}
			if ("object" === typeof type) switch ("number" === typeof type.tag && console.error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), type.$$typeof) {
				case REACT_PORTAL_TYPE: return "Portal";
				case REACT_CONTEXT_TYPE: return type.displayName || "Context";
				case REACT_CONSUMER_TYPE: return (type._context.displayName || "Context") + ".Consumer";
				case REACT_FORWARD_REF_TYPE:
					var innerType = type.render;
					type = type.displayName;
					type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
					return type;
				case REACT_MEMO_TYPE: return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
				case REACT_LAZY_TYPE:
					innerType = type._payload;
					type = type._init;
					try {
						return getComponentNameFromType(type(innerType));
					} catch (x) {}
			}
			return null;
		}
		function getTaskName(type) {
			if (type === REACT_FRAGMENT_TYPE) return "<>";
			if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE) return "<...>";
			try {
				var name = getComponentNameFromType(type);
				return name ? "<" + name + ">" : "<...>";
			} catch (x) {
				return "<...>";
			}
		}
		function getOwner() {
			var dispatcher = ReactSharedInternals.A;
			return null === dispatcher ? null : dispatcher.getOwner();
		}
		function UnknownOwner() {
			return Error("react-stack-top-frame");
		}
		function hasValidKey(config) {
			if (hasOwnProperty.call(config, "key")) {
				var getter = Object.getOwnPropertyDescriptor(config, "key").get;
				if (getter && getter.isReactWarning) return !1;
			}
			return void 0 !== config.key;
		}
		function defineKeyPropWarningGetter(props, displayName) {
			function warnAboutAccessingKey() {
				specialPropKeyWarningShown || (specialPropKeyWarningShown = !0, console.error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)", displayName));
			}
			warnAboutAccessingKey.isReactWarning = !0;
			Object.defineProperty(props, "key", {
				get: warnAboutAccessingKey,
				configurable: !0
			});
		}
		function elementRefGetterWithDeprecationWarning() {
			var componentName = getComponentNameFromType(this.type);
			didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = !0, console.error("Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."));
			componentName = this.props.ref;
			return void 0 !== componentName ? componentName : null;
		}
		function ReactElement(type, key, props, owner, debugStack, debugTask) {
			var refProp = props.ref;
			type = {
				$$typeof: REACT_ELEMENT_TYPE,
				type,
				key,
				props,
				_owner: owner
			};
			null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
				enumerable: !1,
				get: elementRefGetterWithDeprecationWarning
			}) : Object.defineProperty(type, "ref", {
				enumerable: !1,
				value: null
			});
			type._store = {};
			Object.defineProperty(type._store, "validated", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: 0
			});
			Object.defineProperty(type, "_debugInfo", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: null
			});
			Object.defineProperty(type, "_debugStack", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: debugStack
			});
			Object.defineProperty(type, "_debugTask", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: debugTask
			});
			Object.freeze && (Object.freeze(type.props), Object.freeze(type));
			return type;
		}
		function cloneAndReplaceKey(oldElement, newKey) {
			newKey = ReactElement(oldElement.type, newKey, oldElement.props, oldElement._owner, oldElement._debugStack, oldElement._debugTask);
			oldElement._store && (newKey._store.validated = oldElement._store.validated);
			return newKey;
		}
		function validateChildKeys(node) {
			isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
		}
		function isValidElement(object) {
			return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
		}
		function escape(key) {
			var escaperLookup = {
				"=": "=0",
				":": "=2"
			};
			return "$" + key.replace(/[=:]/g, function(match) {
				return escaperLookup[match];
			});
		}
		function getElementKey(element, index) {
			return "object" === typeof element && null !== element && null != element.key ? (checkKeyStringCoercion(element.key), escape("" + element.key)) : index.toString(36);
		}
		function resolveThenable(thenable) {
			switch (thenable.status) {
				case "fulfilled": return thenable.value;
				case "rejected": throw thenable.reason;
				default: switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(function(fulfilledValue) {
					"pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
				}, function(error) {
					"pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
				})), thenable.status) {
					case "fulfilled": return thenable.value;
					case "rejected": throw thenable.reason;
				}
			}
			throw thenable;
		}
		function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
			var type = typeof children;
			if ("undefined" === type || "boolean" === type) children = null;
			var invokeCallback = !1;
			if (null === children) invokeCallback = !0;
			else switch (type) {
				case "bigint":
				case "string":
				case "number":
					invokeCallback = !0;
					break;
				case "object": switch (children.$$typeof) {
					case REACT_ELEMENT_TYPE:
					case REACT_PORTAL_TYPE:
						invokeCallback = !0;
						break;
					case REACT_LAZY_TYPE: return invokeCallback = children._init, mapIntoArray(invokeCallback(children._payload), array, escapedPrefix, nameSoFar, callback);
				}
			}
			if (invokeCallback) {
				invokeCallback = children;
				callback = callback(invokeCallback);
				var childKey = "" === nameSoFar ? "." + getElementKey(invokeCallback, 0) : nameSoFar;
				isArrayImpl(callback) ? (escapedPrefix = "", null != childKey && (escapedPrefix = childKey.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
					return c;
				})) : null != callback && (isValidElement(callback) && (null != callback.key && (invokeCallback && invokeCallback.key === callback.key || checkKeyStringCoercion(callback.key)), escapedPrefix = cloneAndReplaceKey(callback, escapedPrefix + (null == callback.key || invokeCallback && invokeCallback.key === callback.key ? "" : ("" + callback.key).replace(userProvidedKeyEscapeRegex, "$&/") + "/") + childKey), "" !== nameSoFar && null != invokeCallback && isValidElement(invokeCallback) && null == invokeCallback.key && invokeCallback._store && !invokeCallback._store.validated && (escapedPrefix._store.validated = 2), callback = escapedPrefix), array.push(callback));
				return 1;
			}
			invokeCallback = 0;
			childKey = "" === nameSoFar ? "." : nameSoFar + ":";
			if (isArrayImpl(children)) for (var i = 0; i < children.length; i++) nameSoFar = children[i], type = childKey + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
			else if (i = getIteratorFn(children), "function" === typeof i) for (i === children.entries && (didWarnAboutMaps || console.warn("Using Maps as children is not supported. Use an array of keyed ReactElements instead."), didWarnAboutMaps = !0), children = i.call(children), i = 0; !(nameSoFar = children.next()).done;) nameSoFar = nameSoFar.value, type = childKey + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
			else if ("object" === type) {
				if ("function" === typeof children.then) return mapIntoArray(resolveThenable(children), array, escapedPrefix, nameSoFar, callback);
				array = String(children);
				throw Error("Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead.");
			}
			return invokeCallback;
		}
		function mapChildren(children, func, context) {
			if (null == children) return children;
			var result = [], count = 0;
			mapIntoArray(children, result, "", "", function(child) {
				return func.call(context, child, count++);
			});
			return result;
		}
		function lazyInitializer(payload) {
			if (-1 === payload._status) {
				var ioInfo = payload._ioInfo;
				null != ioInfo && (ioInfo.start = ioInfo.end = performance.now());
				ioInfo = payload._result;
				var thenable = ioInfo();
				thenable.then(function(moduleObject) {
					if (0 === payload._status || -1 === payload._status) {
						payload._status = 1;
						payload._result = moduleObject;
						var _ioInfo = payload._ioInfo;
						null != _ioInfo && (_ioInfo.end = performance.now());
						void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
					}
				}, function(error) {
					if (0 === payload._status || -1 === payload._status) {
						payload._status = 2;
						payload._result = error;
						var _ioInfo2 = payload._ioInfo;
						null != _ioInfo2 && (_ioInfo2.end = performance.now());
						void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
					}
				});
				ioInfo = payload._ioInfo;
				if (null != ioInfo) {
					ioInfo.value = thenable;
					var displayName = thenable.displayName;
					"string" === typeof displayName && (ioInfo.name = displayName);
				}
				-1 === payload._status && (payload._status = 0, payload._result = thenable);
			}
			if (1 === payload._status) return ioInfo = payload._result, void 0 === ioInfo && console.error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?", ioInfo), "default" in ioInfo || console.error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))", ioInfo), ioInfo.default;
			throw payload._result;
		}
		function resolveDispatcher() {
			var dispatcher = ReactSharedInternals.H;
			null === dispatcher && console.error("Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.");
			return dispatcher;
		}
		function releaseAsyncTransition() {
			ReactSharedInternals.asyncTransitions--;
		}
		function enqueueTask(task) {
			if (null === enqueueTaskImpl) try {
				var requireString = ("require" + Math.random()).slice(0, 7);
				enqueueTaskImpl = (module && module[requireString]).call(module, "timers").setImmediate;
			} catch (_err) {
				enqueueTaskImpl = function(callback) {
					!1 === didWarnAboutMessageChannel && (didWarnAboutMessageChannel = !0, "undefined" === typeof MessageChannel && console.error("This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."));
					var channel = new MessageChannel();
					channel.port1.onmessage = callback;
					channel.port2.postMessage(void 0);
				};
			}
			return enqueueTaskImpl(task);
		}
		function aggregateErrors(errors) {
			return 1 < errors.length && "function" === typeof AggregateError ? new AggregateError(errors) : errors[0];
		}
		function popActScope(prevActQueue, prevActScopeDepth) {
			prevActScopeDepth !== actScopeDepth - 1 && console.error("You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. ");
			actScopeDepth = prevActScopeDepth;
		}
		function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
			var queue = ReactSharedInternals.actQueue;
			if (null !== queue) if (0 !== queue.length) try {
				flushActQueue(queue);
				enqueueTask(function() {
					return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
				});
				return;
			} catch (error) {
				ReactSharedInternals.thrownErrors.push(error);
			}
			else ReactSharedInternals.actQueue = null;
			0 < ReactSharedInternals.thrownErrors.length ? (queue = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(queue)) : resolve(returnValue);
		}
		function flushActQueue(queue) {
			if (!isFlushing) {
				isFlushing = !0;
				var i = 0;
				try {
					for (; i < queue.length; i++) {
						var callback = queue[i];
						do {
							ReactSharedInternals.didUsePromise = !1;
							var continuation = callback(!1);
							if (null !== continuation) {
								if (ReactSharedInternals.didUsePromise) {
									queue[i] = callback;
									queue.splice(0, i);
									return;
								}
								callback = continuation;
							} else break;
						} while (1);
					}
					queue.length = 0;
				} catch (error) {
					queue.splice(0, i + 1), ReactSharedInternals.thrownErrors.push(error);
				} finally {
					isFlushing = !1;
				}
			}
		}
		"undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
		var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator, didWarnStateUpdateForUnmountedComponent = {}, ReactNoopUpdateQueue = {
			isMounted: function() {
				return !1;
			},
			enqueueForceUpdate: function(publicInstance) {
				warnNoop(publicInstance, "forceUpdate");
			},
			enqueueReplaceState: function(publicInstance) {
				warnNoop(publicInstance, "replaceState");
			},
			enqueueSetState: function(publicInstance) {
				warnNoop(publicInstance, "setState");
			}
		}, assign = Object.assign, emptyObject = {};
		Object.freeze(emptyObject);
		Component.prototype.isReactComponent = {};
		Component.prototype.setState = function(partialState, callback) {
			if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
			this.updater.enqueueSetState(this, partialState, callback, "setState");
		};
		Component.prototype.forceUpdate = function(callback) {
			this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
		};
		var deprecatedAPIs = {
			isMounted: ["isMounted", "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."],
			replaceState: ["replaceState", "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."]
		};
		for (fnName in deprecatedAPIs) deprecatedAPIs.hasOwnProperty(fnName) && defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
		ComponentDummy.prototype = Component.prototype;
		deprecatedAPIs = PureComponent.prototype = new ComponentDummy();
		deprecatedAPIs.constructor = PureComponent;
		assign(deprecatedAPIs, Component.prototype);
		deprecatedAPIs.isPureReactComponent = !0;
		var isArrayImpl = Array.isArray, REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = {
			H: null,
			A: null,
			T: null,
			S: null,
			actQueue: null,
			asyncTransitions: 0,
			isBatchingLegacy: !1,
			didScheduleLegacyUpdate: !1,
			didUsePromise: !1,
			thrownErrors: [],
			getCurrentStack: null,
			recentlyCreatedOwnerStacks: 0
		}, hasOwnProperty = Object.prototype.hasOwnProperty, createTask = console.createTask ? console.createTask : function() {
			return null;
		};
		deprecatedAPIs = { react_stack_bottom_frame: function(callStackForError) {
			return callStackForError();
		} };
		var specialPropKeyWarningShown, didWarnAboutOldJSXRuntime;
		var didWarnAboutElementRef = {};
		var unknownOwnerDebugStack = deprecatedAPIs.react_stack_bottom_frame.bind(deprecatedAPIs, UnknownOwner)();
		var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
		var didWarnAboutMaps = !1, userProvidedKeyEscapeRegex = /\/+/g, reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
			if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
				var event = new window.ErrorEvent("error", {
					bubbles: !0,
					cancelable: !0,
					message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
					error
				});
				if (!window.dispatchEvent(event)) return;
			} else if ("object" === typeof process && "function" === typeof process.emit) {
				process.emit("uncaughtException", error);
				return;
			}
			console.error(error);
		}, didWarnAboutMessageChannel = !1, enqueueTaskImpl = null, actScopeDepth = 0, didWarnNoAwaitAct = !1, isFlushing = !1, queueSeveralMicrotasks = "function" === typeof queueMicrotask ? function(callback) {
			queueMicrotask(function() {
				return queueMicrotask(callback);
			});
		} : enqueueTask;
		deprecatedAPIs = Object.freeze({
			__proto__: null,
			c: function(size) {
				return resolveDispatcher().useMemoCache(size);
			}
		});
		var fnName = {
			map: mapChildren,
			forEach: function(children, forEachFunc, forEachContext) {
				mapChildren(children, function() {
					forEachFunc.apply(this, arguments);
				}, forEachContext);
			},
			count: function(children) {
				var n = 0;
				mapChildren(children, function() {
					n++;
				});
				return n;
			},
			toArray: function(children) {
				return mapChildren(children, function(child) {
					return child;
				}) || [];
			},
			only: function(children) {
				if (!isValidElement(children)) throw Error("React.Children.only expected to receive a single React element child.");
				return children;
			}
		};
		exports.Activity = REACT_ACTIVITY_TYPE;
		exports.Children = fnName;
		exports.Component = Component;
		exports.Fragment = REACT_FRAGMENT_TYPE;
		exports.Profiler = REACT_PROFILER_TYPE;
		exports.PureComponent = PureComponent;
		exports.StrictMode = REACT_STRICT_MODE_TYPE;
		exports.Suspense = REACT_SUSPENSE_TYPE;
		exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
		exports.__COMPILER_RUNTIME = deprecatedAPIs;
		exports.act = function(callback) {
			var prevActQueue = ReactSharedInternals.actQueue, prevActScopeDepth = actScopeDepth;
			actScopeDepth++;
			var queue = ReactSharedInternals.actQueue = null !== prevActQueue ? prevActQueue : [], didAwaitActCall = !1;
			try {
				var result = callback();
			} catch (error) {
				ReactSharedInternals.thrownErrors.push(error);
			}
			if (0 < ReactSharedInternals.thrownErrors.length) throw popActScope(prevActQueue, prevActScopeDepth), callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
			if (null !== result && "object" === typeof result && "function" === typeof result.then) {
				var thenable = result;
				queueSeveralMicrotasks(function() {
					didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = !0, console.error("You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"));
				});
				return { then: function(resolve, reject) {
					didAwaitActCall = !0;
					thenable.then(function(returnValue) {
						popActScope(prevActQueue, prevActScopeDepth);
						if (0 === prevActScopeDepth) {
							try {
								flushActQueue(queue), enqueueTask(function() {
									return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
								});
							} catch (error$0) {
								ReactSharedInternals.thrownErrors.push(error$0);
							}
							if (0 < ReactSharedInternals.thrownErrors.length) {
								var _thrownError = aggregateErrors(ReactSharedInternals.thrownErrors);
								ReactSharedInternals.thrownErrors.length = 0;
								reject(_thrownError);
							}
						} else resolve(returnValue);
					}, function(error) {
						popActScope(prevActQueue, prevActScopeDepth);
						0 < ReactSharedInternals.thrownErrors.length ? (error = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(error)) : reject(error);
					});
				} };
			}
			var returnValue$jscomp$0 = result;
			popActScope(prevActQueue, prevActScopeDepth);
			0 === prevActScopeDepth && (flushActQueue(queue), 0 !== queue.length && queueSeveralMicrotasks(function() {
				didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = !0, console.error("A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"));
			}), ReactSharedInternals.actQueue = null);
			if (0 < ReactSharedInternals.thrownErrors.length) throw callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
			return { then: function(resolve, reject) {
				didAwaitActCall = !0;
				0 === prevActScopeDepth ? (ReactSharedInternals.actQueue = queue, enqueueTask(function() {
					return recursivelyFlushAsyncActWork(returnValue$jscomp$0, resolve, reject);
				})) : resolve(returnValue$jscomp$0);
			} };
		};
		exports.cache = function(fn) {
			return function() {
				return fn.apply(null, arguments);
			};
		};
		exports.cacheSignal = function() {
			return null;
		};
		exports.captureOwnerStack = function() {
			var getCurrentStack = ReactSharedInternals.getCurrentStack;
			return null === getCurrentStack ? null : getCurrentStack();
		};
		exports.cloneElement = function(element, config, children) {
			if (null === element || void 0 === element) throw Error("The argument must be a React element, but you passed " + element + ".");
			var props = assign({}, element.props), key = element.key, owner = element._owner;
			if (null != config) {
				var JSCompiler_inline_result;
				a: {
					if (hasOwnProperty.call(config, "ref") && (JSCompiler_inline_result = Object.getOwnPropertyDescriptor(config, "ref").get) && JSCompiler_inline_result.isReactWarning) {
						JSCompiler_inline_result = !1;
						break a;
					}
					JSCompiler_inline_result = void 0 !== config.ref;
				}
				JSCompiler_inline_result && (owner = getOwner());
				hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key);
				for (propName in config) !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
			}
			var propName = arguments.length - 2;
			if (1 === propName) props.children = children;
			else if (1 < propName) {
				JSCompiler_inline_result = Array(propName);
				for (var i = 0; i < propName; i++) JSCompiler_inline_result[i] = arguments[i + 2];
				props.children = JSCompiler_inline_result;
			}
			props = ReactElement(element.type, key, props, owner, element._debugStack, element._debugTask);
			for (key = 2; key < arguments.length; key++) validateChildKeys(arguments[key]);
			return props;
		};
		exports.createContext = function(defaultValue) {
			defaultValue = {
				$$typeof: REACT_CONTEXT_TYPE,
				_currentValue: defaultValue,
				_currentValue2: defaultValue,
				_threadCount: 0,
				Provider: null,
				Consumer: null
			};
			defaultValue.Provider = defaultValue;
			defaultValue.Consumer = {
				$$typeof: REACT_CONSUMER_TYPE,
				_context: defaultValue
			};
			defaultValue._currentRenderer = null;
			defaultValue._currentRenderer2 = null;
			return defaultValue;
		};
		exports.createElement = function(type, config, children) {
			for (var i = 2; i < arguments.length; i++) validateChildKeys(arguments[i]);
			i = {};
			var key = null;
			if (null != config) for (propName in didWarnAboutOldJSXRuntime || !("__self" in config) || "key" in config || (didWarnAboutOldJSXRuntime = !0, console.warn("Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform")), hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key), config) hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (i[propName] = config[propName]);
			var childrenLength = arguments.length - 2;
			if (1 === childrenLength) i.children = children;
			else if (1 < childrenLength) {
				for (var childArray = Array(childrenLength), _i = 0; _i < childrenLength; _i++) childArray[_i] = arguments[_i + 2];
				Object.freeze && Object.freeze(childArray);
				i.children = childArray;
			}
			if (type && type.defaultProps) for (propName in childrenLength = type.defaultProps, childrenLength) void 0 === i[propName] && (i[propName] = childrenLength[propName]);
			key && defineKeyPropWarningGetter(i, "function" === typeof type ? type.displayName || type.name || "Unknown" : type);
			var propName = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
			return ReactElement(type, key, i, getOwner(), propName ? Error("react-stack-top-frame") : unknownOwnerDebugStack, propName ? createTask(getTaskName(type)) : unknownOwnerDebugTask);
		};
		exports.createRef = function() {
			var refObject = { current: null };
			Object.seal(refObject);
			return refObject;
		};
		exports.forwardRef = function(render) {
			null != render && render.$$typeof === REACT_MEMO_TYPE ? console.error("forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...)).") : "function" !== typeof render ? console.error("forwardRef requires a render function but was given %s.", null === render ? "null" : typeof render) : 0 !== render.length && 2 !== render.length && console.error("forwardRef render functions accept exactly two parameters: props and ref. %s", 1 === render.length ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined.");
			null != render && null != render.defaultProps && console.error("forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?");
			var elementType = {
				$$typeof: REACT_FORWARD_REF_TYPE,
				render
			}, ownName;
			Object.defineProperty(elementType, "displayName", {
				enumerable: !1,
				configurable: !0,
				get: function() {
					return ownName;
				},
				set: function(name) {
					ownName = name;
					render.name || render.displayName || (Object.defineProperty(render, "name", { value: name }), render.displayName = name);
				}
			});
			return elementType;
		};
		exports.isValidElement = isValidElement;
		exports.lazy = function(ctor) {
			ctor = {
				_status: -1,
				_result: ctor
			};
			var lazyType = {
				$$typeof: REACT_LAZY_TYPE,
				_payload: ctor,
				_init: lazyInitializer
			}, ioInfo = {
				name: "lazy",
				start: -1,
				end: -1,
				value: null,
				owner: null,
				debugStack: Error("react-stack-top-frame"),
				debugTask: console.createTask ? console.createTask("lazy()") : null
			};
			ctor._ioInfo = ioInfo;
			lazyType._debugInfo = [{ awaited: ioInfo }];
			return lazyType;
		};
		exports.memo = function(type, compare) {
			type ?? console.error("memo: The first argument must be a component. Instead received: %s", null === type ? "null" : typeof type);
			compare = {
				$$typeof: REACT_MEMO_TYPE,
				type,
				compare: void 0 === compare ? null : compare
			};
			var ownName;
			Object.defineProperty(compare, "displayName", {
				enumerable: !1,
				configurable: !0,
				get: function() {
					return ownName;
				},
				set: function(name) {
					ownName = name;
					type.name || type.displayName || (Object.defineProperty(type, "name", { value: name }), type.displayName = name);
				}
			});
			return compare;
		};
		exports.startTransition = function(scope) {
			var prevTransition = ReactSharedInternals.T, currentTransition = {};
			currentTransition._updatedFibers = /* @__PURE__ */ new Set();
			ReactSharedInternals.T = currentTransition;
			try {
				var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
				null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
				"object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && (ReactSharedInternals.asyncTransitions++, returnValue.then(releaseAsyncTransition, releaseAsyncTransition), returnValue.then(noop, reportGlobalError));
			} catch (error) {
				reportGlobalError(error);
			} finally {
				null === prevTransition && currentTransition._updatedFibers && (scope = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < scope && console.warn("Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table.")), null !== prevTransition && null !== currentTransition.types && (null !== prevTransition.types && prevTransition.types !== currentTransition.types && console.error("We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."), prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
			}
		};
		exports.unstable_useCacheRefresh = function() {
			return resolveDispatcher().useCacheRefresh();
		};
		exports.use = function(usable) {
			return resolveDispatcher().use(usable);
		};
		exports.useActionState = function(action, initialState, permalink) {
			return resolveDispatcher().useActionState(action, initialState, permalink);
		};
		exports.useCallback = function(callback, deps) {
			return resolveDispatcher().useCallback(callback, deps);
		};
		exports.useContext = function(Context) {
			var dispatcher = resolveDispatcher();
			Context.$$typeof === REACT_CONSUMER_TYPE && console.error("Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?");
			return dispatcher.useContext(Context);
		};
		exports.useDebugValue = function(value, formatterFn) {
			return resolveDispatcher().useDebugValue(value, formatterFn);
		};
		exports.useDeferredValue = function(value, initialValue) {
			return resolveDispatcher().useDeferredValue(value, initialValue);
		};
		exports.useEffect = function(create, deps) {
			create ?? console.warn("React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?");
			return resolveDispatcher().useEffect(create, deps);
		};
		exports.useEffectEvent = function(callback) {
			return resolveDispatcher().useEffectEvent(callback);
		};
		exports.useId = function() {
			return resolveDispatcher().useId();
		};
		exports.useImperativeHandle = function(ref, create, deps) {
			return resolveDispatcher().useImperativeHandle(ref, create, deps);
		};
		exports.useInsertionEffect = function(create, deps) {
			create ?? console.warn("React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?");
			return resolveDispatcher().useInsertionEffect(create, deps);
		};
		exports.useLayoutEffect = function(create, deps) {
			create ?? console.warn("React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?");
			return resolveDispatcher().useLayoutEffect(create, deps);
		};
		exports.useMemo = function(create, deps) {
			return resolveDispatcher().useMemo(create, deps);
		};
		exports.useOptimistic = function(passthrough, reducer) {
			return resolveDispatcher().useOptimistic(passthrough, reducer);
		};
		exports.useReducer = function(reducer, initialArg, init) {
			return resolveDispatcher().useReducer(reducer, initialArg, init);
		};
		exports.useRef = function(initialValue) {
			return resolveDispatcher().useRef(initialValue);
		};
		exports.useState = function(initialState) {
			return resolveDispatcher().useState(initialState);
		};
		exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
			return resolveDispatcher().useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
		};
		exports.useTransition = function() {
			return resolveDispatcher().useTransition();
		};
		exports.version = "19.2.8";
		"undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
	})();
}));
//#endregion
//#region node_modules/zustand/esm/react.mjs
var import_react = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	if (process.env.NODE_ENV === "production") module.exports = require_react_production();
	else module.exports = require_react_development();
})))(), 1);
var identity = (arg) => arg;
function useStore(api, selector = identity) {
	const slice = import_react.useSyncExternalStore(api.subscribe, import_react.useCallback(() => selector(api.getState()), [api, selector]), import_react.useCallback(() => selector(api.getInitialState()), [api, selector]));
	import_react.useDebugValue(slice);
	return slice;
}
var createImpl = (createState) => {
	const api = createStore(createState);
	const useBoundStore = (selector) => useStore(api, selector);
	Object.assign(useBoundStore, api);
	return useBoundStore;
};
var create = ((createState) => createState ? createImpl(createState) : createImpl);
/**
* Stores the callback in a known location, and returns an identifier that can be passed to the backend.
* The backend uses the identifier to `eval()` the callback.
*
* @return An unique identifier associated with the callback function.
*
* @since 1.0.0
*/
function transformCallback(callback, once = false) {
	return window.__TAURI_INTERNALS__.transformCallback(callback, once);
}
/**
* Sends a message to the backend.
* @example
* ```typescript
* import { invoke } from '@tauri-apps/api/core';
* await invoke('login', { user: 'tauri', password: 'poiwe3h4r5ip3yrhtew9ty' });
* ```
*
* @param cmd The command name.
* @param args The optional arguments to pass to the command.
* @param options The request options.
* @return A promise resolving or rejecting to the backend response.
*
* @since 1.0.0
*/
async function invoke(cmd, args = {}, options) {
	return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
}
//#endregion
//#region node_modules/@tauri-apps/api/event.js
/**
* The event system allows you to emit events to the backend and listen to events from it.
*
* This package is also accessible with `window.__TAURI__.event` when [`app.withGlobalTauri`](https://v2.tauri.app/reference/config/#withglobaltauri) in `tauri.conf.json` is set to `true`.
* @module
*/
/**
* @since 1.1.0
*/
var TauriEvent;
(function(TauriEvent) {
	TauriEvent["WINDOW_RESIZED"] = "tauri://resize";
	TauriEvent["WINDOW_MOVED"] = "tauri://move";
	TauriEvent["WINDOW_CLOSE_REQUESTED"] = "tauri://close-requested";
	TauriEvent["WINDOW_DESTROYED"] = "tauri://destroyed";
	TauriEvent["WINDOW_FOCUS"] = "tauri://focus";
	TauriEvent["WINDOW_BLUR"] = "tauri://blur";
	TauriEvent["WINDOW_SCALE_FACTOR_CHANGED"] = "tauri://scale-change";
	TauriEvent["WINDOW_THEME_CHANGED"] = "tauri://theme-changed";
	TauriEvent["WINDOW_CREATED"] = "tauri://window-created";
	TauriEvent["WINDOW_SUSPENDED"] = "tauri://suspended";
	TauriEvent["WINDOW_RESUMED"] = "tauri://resumed";
	TauriEvent["WEBVIEW_CREATED"] = "tauri://webview-created";
	TauriEvent["DRAG_ENTER"] = "tauri://drag-enter";
	TauriEvent["DRAG_OVER"] = "tauri://drag-over";
	TauriEvent["DRAG_DROP"] = "tauri://drag-drop";
	TauriEvent["DRAG_LEAVE"] = "tauri://drag-leave";
})(TauriEvent || (TauriEvent = {}));
/**
* Unregister the event listener associated with the given name and id.
*
* @ignore
* @param event The event name
* @param eventId Event identifier
* @returns
*/
async function _unlisten(event, eventId) {
	window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(event, eventId);
	await invoke("plugin:event|unlisten", {
		event,
		eventId
	});
}
/**
* Listen to an emitted event to any {@link EventTarget|target}.
*
* @example
* ```typescript
* import { listen } from '@tauri-apps/api/event';
* const unlisten = await listen<string>('error', (event) => {
*   console.log(`Got error, payload: ${event.payload}`);
* });
*
* // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
* unlisten();
* ```
*
* @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
* @param handler Event handler callback.
* @param options Event listening options.
* @returns A promise resolving to a function to unlisten to the event.
* Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
*
* @since 1.0.0
*/
async function listen(event, handler, options) {
	var _a;
	return invoke("plugin:event|listen", {
		event,
		target: typeof (options === null || options === void 0 ? void 0 : options.target) === "string" ? {
			kind: "AnyLabel",
			label: options.target
		} : (_a = options === null || options === void 0 ? void 0 : options.target) !== null && _a !== void 0 ? _a : { kind: "Any" },
		handler: transformCallback(handler)
	}).then((eventId) => {
		return async () => _unlisten(event, eventId);
	});
}
//#endregion
//#region src/lib/tauri.ts
var ipc = {
	spawnRun: (opts) => invoke("spawn_run", { opts }),
	killRun: (runId) => invoke("kill_run", { runId }),
	runningRuns: () => invoke("running_runs"),
	loadConfig: () => invoke("load_config"),
	saveConfig: (config) => invoke("save_config", { config }),
	detectBinaries: () => invoke("detect_binaries")
};
function onRunOutput(handler) {
	return listen("run-output", (ev) => handler(ev.payload));
}
function onRunExit(handler) {
	return listen("run-exit", (ev) => handler(ev.payload));
}
/** True when running inside the Tauri webview (false in a plain browser). */
var isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
//#endregion
//#region src/lib/transport-tauri.ts
var tauriTransport = {
	spawnRun: async (opts) => ipc.spawnRun(opts),
	killRun: async (runId) => ipc.killRun(runId),
	onRunOutput: async (h) => onRunOutput(h),
	onRunExit: async (h) => onRunExit(h),
	loadConfig: async () => ipc.loadConfig(),
	saveConfig: async (config) => ipc.saveConfig(config),
	detectBinaries: async () => ipc.detectBinaries()
};
//#endregion
//#region src/lib/transport-null.ts
var nullTransport = {
	spawnRun: async () => {},
	killRun: async () => false,
	onRunOutput: async () => () => {},
	onRunExit: async () => () => {},
	loadConfig: async () => null,
	saveConfig: async () => {},
	detectBinaries: async () => ({})
};
//#endregion
//#region src/lib/transport.ts
var currentTransport = null;
function setTransport(t) {
	currentTransport = t;
}
function getTransport() {
	if (currentTransport) return currentTransport;
	return isTauri() ? tauriTransport : nullTransport;
}
//#endregion
//#region src/lib/providers.ts
function parseJsonTolerant(line) {
	try {
		return JSON.parse(line);
	} catch {
		return null;
	}
}
function parseClaudeLine(line, stream) {
	const obj = parseJsonTolerant(line);
	if (!obj) {
		if (stream === "stderr") return [{
			type: "error",
			text: line
		}];
		return [{
			type: "raw",
			text: line
		}];
	}
	if (obj.type === "system" && obj.subtype === "init") return [{
		type: "session",
		sessionId: obj.session_id
	}];
	if (obj.type === "assistant" && obj.message && Array.isArray(obj.message.content)) {
		const events = [];
		for (const item of obj.message.content) if (item.type === "text") events.push({
			type: "text",
			text: item.text
		});
		else if (item.type === "tool_use") {
			const detail = item.input ? JSON.stringify(item.input).substring(0, 200) : void 0;
			events.push({
				type: "tool",
				name: item.name,
				detail
			});
		}
		return events;
	}
	if (obj.type === "result") return [{
		type: "result",
		text: obj.result || "",
		sessionId: obj.session_id
	}];
	return [];
}
function parseAntigravityLine(line, stream) {
	const obj = parseJsonTolerant(line);
	if (!obj) {
		if (stream === "stderr") return [{
			type: "error",
			text: line
		}];
		return [{
			type: "raw",
			text: line
		}];
	}
	if (obj.event === "init" && obj.conversation_id) return [{
		type: "session",
		sessionId: obj.conversation_id
	}];
	if (obj.event === "step_update" && obj.step_update) {
		const { step_type, state, text_delta, tool_name, tool_info } = obj.step_update;
		if (step_type === "agent_response") return text_delta ? [{
			type: "text",
			text: text_delta
		}] : [];
		if (step_type === "user_input" || step_type === "system_message") return [];
		const name = tool_name || tool_info?.name || step_type;
		const params = tool_info?.parameters;
		const detail = params ? JSON.stringify(params).substring(0, 200) : void 0;
		if (state === "ACTIVE") return [{
			type: "tool",
			name,
			detail
		}];
		if (state === "ERROR") return [{
			type: "error",
			text: `Falló la herramienta ${name}`
		}];
		return [];
	}
	if (obj.event === "result" && obj.result) {
		const events = [];
		if (obj.result.status !== "SUCCESS" && obj.result.error) events.push({
			type: "error",
			text: obj.result.error
		});
		events.push({
			type: "result",
			text: obj.result.response || "",
			sessionId: obj.result.conversation_id
		});
		return events;
	}
	return [];
}
function parsePlainLine(line, stream) {
	if (stream === "stderr" && line.trim() !== "") return [{
		type: "error",
		text: line
	}];
	return [{
		type: "text",
		text: line + "\n"
	}];
}
var PROVIDERS = {
	claude: {
		id: "claude",
		label: "Claude Code",
		defaultModels: [
			"sonnet",
			"opus",
			"haiku"
		],
		supportsSessions: true,
		promptVia: "stdin",
		buildCommand: (input) => {
			const args = [
				"-p",
				"--output-format",
				"stream-json",
				"--verbose"
			];
			if (input.agent.model) args.push("--model", input.agent.model);
			if (input.sessionId) args.push("--resume", input.sessionId);
			if (input.systemPrompt) args.push("--append-system-prompt", input.systemPrompt);
			if (input.agent.autoApprove) args.push("--dangerously-skip-permissions");
			else args.push("--permission-mode", "acceptEdits");
			if (input.agent.role === "planner") args.push("--allowedTools", "Read", "Grep", "Glob", "LS", "WebSearch", "WebFetch");
			return {
				program: input.binaryPath,
				args,
				cwd: input.cwd,
				stdinText: input.prompt,
				env: { NO_COLOR: "1" }
			};
		},
		parseLine: parseClaudeLine
	},
	antigravity: {
		id: "antigravity",
		label: "Antigravity",
		defaultModels: [
			"gemini-3.1-pro-high",
			"gemini-3.8-flash-high",
			"claude-sonnet-4-6",
			"claude-opus-4-6-thinking"
		],
		supportsSessions: true,
		promptVia: "arg",
		buildCommand: (input) => {
			const args = [
				"-p",
				`## Instrucciones del sistema\n${input.systemPrompt}\n\n## Tarea\n${input.prompt}`,
				"--output-format",
				"stream-json",
				"--print-timeout",
				"30m"
			];
			if (input.cwd) args.push("--add-dir", input.cwd);
			if (input.agent.model) args.push("--model", input.agent.model);
			if (input.sessionId) args.push("--conversation", input.sessionId);
			if (input.agent.autoApprove) args.push("--dangerously-skip-permissions");
			else args.push("--mode", "accept-edits");
			return {
				program: input.binaryPath,
				args,
				cwd: input.cwd,
				env: { NO_COLOR: "1" }
			};
		},
		parseLine: parseAntigravityLine
	},
	copilot: {
		id: "copilot",
		label: "GitHub Copilot",
		defaultModels: [],
		supportsSessions: false,
		promptVia: "arg",
		buildCommand: (input) => {
			const args = ["-p", `## Instrucciones del sistema\n${input.systemPrompt}\n\n## Tarea\n${input.prompt}`];
			if (input.agent.autoApprove) args.push("--allow-all-tools");
			if (input.agent.model) args.push("--model", input.agent.model);
			return {
				program: input.binaryPath,
				args,
				cwd: input.cwd,
				env: { NO_COLOR: "1" }
			};
		},
		parseLine: parsePlainLine
	},
	gemini: {
		id: "gemini",
		label: "Gemini CLI",
		defaultModels: [],
		supportsSessions: false,
		promptVia: "arg",
		buildCommand: (input) => {
			const args = ["-p", `## Instrucciones del sistema\n${input.systemPrompt}\n\n## Tarea\n${input.prompt}`];
			if (input.agent.autoApprove) args.push("--yolo");
			if (input.agent.model) args.push("-m", input.agent.model);
			return {
				program: input.binaryPath,
				args,
				cwd: input.cwd,
				env: { NO_COLOR: "1" }
			};
		},
		parseLine: parsePlainLine
	},
	codex: {
		id: "codex",
		label: "Codex CLI",
		defaultModels: [],
		supportsSessions: false,
		promptVia: "arg",
		buildCommand: (input) => {
			const args = ["exec", `## Instrucciones del sistema\n${input.systemPrompt}\n\n## Tarea\n${input.prompt}`];
			if (input.agent.autoApprove) args.push("--full-auto");
			if (input.agent.model) args.push("-m", input.agent.model);
			return {
				program: input.binaryPath,
				args,
				cwd: input.cwd,
				env: { NO_COLOR: "1" }
			};
		},
		parseLine: parsePlainLine
	},
	custom: {
		id: "custom",
		label: "Custom Command",
		defaultModels: [],
		supportsSessions: false,
		promptVia: "arg",
		buildCommand: (input) => {
			const cmd = input.agent.customCommand;
			if (!cmd) throw new Error("Missing custom command config");
			const prompt = `## Instrucciones del sistema\n${input.systemPrompt}\n\n## Tarea\n${input.prompt}`;
			let args = [...cmd.args];
			let hasPrompt = false;
			args = args.map((a) => {
				if (a.includes("{prompt}")) {
					hasPrompt = true;
					return a.replace(/{prompt}/g, prompt);
				}
				return a;
			});
			return {
				program: cmd.program,
				args,
				cwd: input.cwd,
				stdinText: !hasPrompt ? prompt : void 0,
				env: { NO_COLOR: "1" }
			};
		},
		parseLine: parsePlainLine
	}
};
function finalOutputFromLines(lines) {
	return lines.join("");
}
function buildSystemPrompt(agent, children) {
	let prompt = "";
	if (agent.role === "planner") {
		prompt = "Sos el PLANIFICADOR de un equipo de agentes de IA. No implementás vos: analizás, dividís el trabajo y delegás.";
		if (children.length > 0) {
			prompt += " Agentes disponibles bajo tu mando:\n";
			for (const child of children) prompt += `- ${child.name} (${child.role}): ${child.description ?? ""}\n`;
			prompt += `Para delegar incluí en tu respuesta uno o más bloques exactamente así:
\`\`\`delegate
{"tasks":[{"agent":"nombre o id del agente","task":"instrucción detallada y autocontenida"}]}
\`\`\`
Cada task debe ser autocontenida (el agente no ve esta conversación). Cuando recibas los resultados, verificalos; si falta algo delegá de nuevo. Si no queda nada por delegar respondé sin bloques delegate con un resumen final para el usuario.`;
		} else prompt += " No tenés agentes bajo tu mando. Respondé directamente a la tarea.";
	} else if (agent.role === "implementer") prompt = "Sos IMPLEMENTADOR. Recibís tareas de tu planificador. Hacé los cambios en el workspace. Al terminar respondé un resumen claro: qué cambiaste (archivos), qué verificaste, qué quedó pendiente o bloqueado.";
	else if (agent.role === "reviewer") prompt = "Sos REVISOR. Revisás cambios y respondés hallazgos o sugerencias de mejora.";
	else if (agent.role === "custom") {}
	if (agent.systemPrompt) prompt += (prompt ? "\n\n" : "") + agent.systemPrompt;
	return prompt;
}
function parseDelegations(text) {
	const delegations = [];
	const regex = /\`\`\`delegate\s*\n([\s\S]*?)\`\`\`/g;
	let match;
	while ((match = regex.exec(text)) !== null) try {
		const obj = JSON.parse(match[1]);
		let tasks = obj;
		if (obj && Array.isArray(obj.tasks)) tasks = obj.tasks;
		if (Array.isArray(tasks)) {
			for (const t of tasks) if (t && typeof t.agent === "string" && typeof t.task === "string") delegations.push({
				agent: t.agent,
				task: t.task
			});
		}
	} catch {}
	return delegations;
}
//#endregion
//#region src/lib/orchestrator.ts
var listenersAttached = false;
async function attachListeners() {
	if (listenersAttached) return;
	listenersAttached = true;
	await getTransport().onRunOutput(handleOutput);
	await getTransport().onRunExit(handleExit);
}
function addMessage(msg) {
	useAppStore.setState((state) => ({ messages: [...state.messages, {
		...msg,
		id: crypto.randomUUID(),
		ts: Date.now()
	}] }));
}
function appendCommText(agentId, runId, delta) {
	useAppStore.setState((state) => {
		const msgId = `text-${runId}`;
		const idx = state.messages.findIndex((m) => m.id === msgId);
		if (idx >= 0) {
			const newMsgs = [...state.messages];
			newMsgs[idx] = {
				...newMsgs[idx],
				text: newMsgs[idx].text + delta
			};
			return { messages: newMsgs };
		} else return { messages: [...state.messages, {
			id: msgId,
			ts: Date.now(),
			runId,
			fromAgentId: agentId,
			kind: "text",
			text: delta
		}] };
	});
}
function startRun(opts) {
	const store = useAppStore.getState();
	const agent = selectAgent(store, opts.agentId);
	if (!agent) return void 0;
	const runId = crypto.randomUUID();
	const run = {
		id: runId,
		agentId: opts.agentId,
		parentRunId: opts.parentRunId,
		rootRunId: opts.rootRunId ?? runId,
		prompt: opts.prompt,
		status: "running",
		startedAt: Date.now(),
		output: "",
		rawLines: [],
		childRunIds: [],
		round: opts.round
	};
	useAppStore.setState((state) => {
		const parentRun = opts.parentRunId ? state.runs[opts.parentRunId] : void 0;
		return {
			runs: {
				...state.runs,
				[runId]: run,
				...parentRun && opts.parentRunId ? { [opts.parentRunId]: {
					...parentRun,
					childRunIds: [...parentRun.childRunIds, runId]
				} } : {}
			},
			runtime: {
				...state.runtime,
				[opts.agentId]: {
					...state.runtime[opts.agentId],
					status: "working",
					currentRunId: runId,
					currentTask: opts.prompt
				}
			}
		};
	});
	const provider = PROVIDERS[agent.provider];
	const binary = agent.provider === "custom" ? agent.customCommand?.program ? { path: agent.customCommand.program } : null : store.binaries[agent.provider];
	if (!binary || !binary.path) {
		const err = `No se encontró el CLI de ${provider.label}. Instalalo o configurá un comando custom.`;
		useAppStore.setState((state) => ({
			runs: {
				...state.runs,
				[runId]: {
					...state.runs[runId],
					status: "error",
					output: err,
					endedAt: Date.now()
				}
			},
			runtime: {
				...state.runtime,
				[opts.agentId]: {
					...state.runtime[opts.agentId],
					status: "error",
					lastError: err,
					currentRunId: void 0
				}
			}
		}));
		addMessage({
			fromAgentId: "system",
			toAgentId: opts.agentId,
			kind: "error",
			text: err,
			runId
		});
		setTimeout(() => onRunFinished(runId), 0);
		return runId;
	}
	const systemPrompt = buildSystemPrompt(agent, selectChildren(store, agent.id));
	const sessionId = opts.resume ? store.runtime[opts.agentId]?.sessionId : void 0;
	const spawnOpts = provider.buildCommand({
		agent,
		prompt: opts.prompt,
		systemPrompt,
		sessionId,
		cwd: store.config.workspaceDir ?? void 0,
		binaryPath: binary.path
	});
	getTransport().spawnRun({
		runId,
		...spawnOpts
	}).catch((err) => {
		useAppStore.setState((state) => ({
			runs: {
				...state.runs,
				[runId]: {
					...state.runs[runId],
					status: "error",
					output: String(err),
					endedAt: Date.now()
				}
			},
			runtime: {
				...state.runtime,
				[opts.agentId]: {
					...state.runtime[opts.agentId],
					status: "error",
					lastError: String(err),
					currentRunId: void 0
				}
			}
		}));
		addMessage({
			fromAgentId: "system",
			toAgentId: opts.agentId,
			kind: "error",
			text: String(err),
			runId
		});
		onRunFinished(runId);
	});
	return runId;
}
function handleOutput(e) {
	const store = useAppStore.getState();
	const run = store.runs[e.runId];
	if (!run) return;
	const agent = selectAgent(store, run.agentId);
	if (!agent) return;
	const events = PROVIDERS[agent.provider].parseLine(e.line, e.stream);
	useAppStore.setState((state) => {
		const r = state.runs[e.runId];
		if (!r) return state;
		return { runs: {
			...state.runs,
			[e.runId]: {
				...r,
				rawLines: [...r.rawLines, e.line].slice(-2e3)
			}
		} };
	});
	for (const ev of events) if (ev.type === "session") useAppStore.setState((state) => ({ runtime: {
		...state.runtime,
		[run.agentId]: {
			...state.runtime[run.agentId],
			sessionId: ev.sessionId
		}
	} }));
	else if (ev.type === "text") appendCommText(run.agentId, e.runId, ev.text);
	else if (ev.type === "tool") {
		const text = ev.detail ? `${ev.name}: ${ev.detail}` : ev.name;
		addMessage({
			fromAgentId: run.agentId,
			kind: "tool",
			text: text.substring(0, 300),
			runId: e.runId
		});
	} else if (ev.type === "result") useAppStore.setState((state) => {
		const r = state.runs[e.runId];
		return {
			runs: {
				...state.runs,
				[e.runId]: {
					...r,
					output: ev.text
				}
			},
			...ev.sessionId ? { runtime: {
				...state.runtime,
				[run.agentId]: {
					...state.runtime[run.agentId],
					sessionId: ev.sessionId
				}
			} } : {}
		};
	});
	else if (ev.type === "error") addMessage({
		fromAgentId: run.agentId,
		kind: "error",
		text: ev.text,
		runId: e.runId
	});
}
function handleExit(e) {
	const run = useAppStore.getState().runs[e.runId];
	if (!run) return;
	const isError = e.code !== 0 && !e.killed && !run.output;
	const status = e.killed ? "killed" : isError ? "error" : "done";
	const output = e.killed ? "[detenido por el usuario]" : run.output || finalOutputFromLines(run.rawLines);
	useAppStore.setState((state) => ({ runs: {
		...state.runs,
		[e.runId]: {
			...state.runs[e.runId],
			status,
			output,
			endedAt: Date.now(),
			exitCode: e.code
		}
	} }));
	onRunFinished(e.runId);
}
function onRunFinished(runId) {
	const store = useAppStore.getState();
	const run = store.runs[runId];
	if (!run) return;
	const agent = selectAgent(store, run.agentId);
	if (!agent) return;
	let agentStatus = run.status === "killed" ? "stopped" : run.status === "error" ? "error" : "idle";
	let waitingForChildren = false;
	if (run.status === "done" || run.status === "killed") {
		const children = selectChildren(store, agent.id);
		if (children.length > 0) {
			const delegations = parseDelegations(run.output);
			if (delegations.length > 0) {
				waitingForChildren = true;
				agentStatus = "waiting";
				for (const task of delegations) {
					const childAgent = children.find((c) => c.name.toLowerCase() === task.agent.toLowerCase() || c.id === task.agent);
					if (childAgent) {
						addMessage({
							fromAgentId: agent.id,
							toAgentId: childAgent.id,
							kind: "delegation",
							text: task.task,
							runId
						});
						startRun({
							agentId: childAgent.id,
							prompt: task.task,
							parentRunId: runId,
							round: run.round,
							rootRunId: run.rootRunId
						});
					} else addMessage({
						fromAgentId: "system",
						toAgentId: agent.id,
						kind: "error",
						text: `Delegación fallida: no se encontró al agente "${task.agent}" bajo el mando de ${agent.name}.`,
						runId
					});
				}
			}
		}
	}
	useAppStore.setState((state) => ({ runtime: {
		...state.runtime,
		[agent.id]: {
			...state.runtime[agent.id],
			status: agentStatus,
			currentRunId: void 0,
			currentTask: void 0
		}
	} }));
	if (!waitingForChildren) {
		if (!run.parentRunId) {
			addMessage({
				fromAgentId: agent.id,
				toAgentId: "user",
				kind: "result",
				text: run.output,
				runId
			});
			if (useAppStore.getState().activeTaskRunId === run.rootRunId) useAppStore.setState({ activeTaskRunId: null });
		} else maybeContinueParent(run.parentRunId);
	}
	processQueuedInstructions(agent.id);
}
function maybeContinueParent(parentRunId) {
	const store = useAppStore.getState();
	const parentRun = store.runs[parentRunId];
	if (!parentRun) return;
	if (parentRun.childRunIds.every((id) => {
		const r = store.runs[id];
		return r && (r.status === "done" || r.status === "error" || r.status === "killed");
	})) {
		const parentAgent = selectAgent(store, parentRun.agentId);
		if (!parentAgent) return;
		let outputText = "Resultados de tus agentes:\n\n";
		for (const id of parentRun.childRunIds) {
			const childRun = store.runs[id];
			if (childRun) {
				const childAgent = selectAgent(store, childRun.agentId);
				outputText += `### ${childAgent?.name || childRun.agentId}\n${childRun.output}\n\n`;
			}
		}
		const cancelled = cancelledRuns.delete(parentRunId);
		if (cancelled || parentRun.round >= store.config.maxRounds) {
			addMessage({
				fromAgentId: "system",
				toAgentId: parentRun.agentId,
				kind: "system",
				text: cancelled ? `Tarea de ${parentAgent.name} detenida por el usuario` : "Se alcanzó el máximo de rondas"
			});
			if (cancelled) useAppStore.setState((state) => ({ runs: {
				...state.runs,
				[parentRunId]: {
					...state.runs[parentRunId],
					output: "[detenido por el usuario]"
				}
			} }));
			useAppStore.setState((state) => ({ runtime: {
				...state.runtime,
				[parentRun.agentId]: {
					...state.runtime[parentRun.agentId],
					status: "idle"
				}
			} }));
			if (!parentRun.parentRunId) useAppStore.setState({ activeTaskRunId: null });
			else maybeContinueParent(parentRun.parentRunId);
		} else startRun({
			agentId: parentRun.agentId,
			prompt: outputText,
			parentRunId: parentRun.parentRunId,
			round: parentRun.round + 1,
			resume: true,
			rootRunId: parentRun.rootRunId
		});
	}
}
function processQueuedInstructions(agentId) {
	const runtime = useAppStore.getState().runtime[agentId];
	if (!runtime || runtime.status === "working") return;
	if (runtime.queuedInstructions.length > 0) {
		const text = runtime.queuedInstructions[0];
		useAppStore.setState((state) => ({ runtime: {
			...state.runtime,
			[agentId]: {
				...state.runtime[agentId],
				queuedInstructions: state.runtime[agentId].queuedInstructions.slice(1)
			}
		} }));
		startRun({
			agentId,
			prompt: text,
			parentRunId: null,
			round: 0,
			resume: true
		});
	}
}
async function submitPrompt(text, targetAgentId) {
	addMessage({
		fromAgentId: "user",
		toAgentId: targetAgentId,
		kind: "user",
		text
	});
	const runId = startRun({
		agentId: targetAgentId,
		prompt: text,
		parentRunId: null,
		round: 0
	});
	if (runId) useAppStore.setState({ activeTaskRunId: runId });
}
async function instructAgent(agentId, text) {
	const runtime = useAppStore.getState().runtime[agentId];
	if (!runtime) return;
	addMessage({
		fromAgentId: "user",
		toAgentId: agentId,
		kind: "instruction",
		text
	});
	if (runtime.status === "working") useAppStore.setState((state) => ({ runtime: {
		...state.runtime,
		[agentId]: {
			...state.runtime[agentId],
			queuedInstructions: [...state.runtime[agentId].queuedInstructions, text]
		}
	} }));
	else startRun({
		agentId,
		prompt: text,
		parentRunId: null,
		round: 0,
		resume: true
	});
}
/** True when `run` descends (through parentRunId) from a run of `agentId`. */
function descendsFromAgent(runs, run, agentId) {
	let cursor = run.parentRunId ? runs[run.parentRunId] : void 0;
	while (cursor) {
		if (cursor.agentId === agentId) return true;
		cursor = cursor.parentRunId ? runs[cursor.parentRunId] : void 0;
	}
	return false;
}
/** Runs whose continuation was cancelled by the user while they waited for children. */
var cancelledRuns = /* @__PURE__ */ new Set();
async function stopAgent(agentId) {
	const store = useAppStore.getState();
	const runtime = store.runtime[agentId];
	if (runtime?.currentRunId) {
		await getTransport().killRun(runtime.currentRunId);
		return;
	}
	const descendants = Object.values(store.runs).filter((r) => r.status === "running" && descendsFromAgent(store.runs, r, agentId));
	for (const r of descendants) {
		let cursor = r.parentRunId ? store.runs[r.parentRunId] : void 0;
		while (cursor) {
			if (cursor.agentId === agentId) {
				cancelledRuns.add(cursor.id);
				break;
			}
			cursor = cursor.parentRunId ? store.runs[cursor.parentRunId] : void 0;
		}
	}
	await Promise.all(descendants.map((r) => getTransport().killRun(r.id).catch(() => {})));
	if (descendants.length === 0) useAppStore.setState((state) => ({ runtime: {
		...state.runtime,
		[agentId]: {
			...state.runtime[agentId],
			status: "idle"
		}
	} }));
}
async function stopAll() {
	const store = useAppStore.getState();
	for (const agentId in store.runtime) {
		const runtime = store.runtime[agentId];
		if (runtime?.currentRunId) getTransport().killRun(runtime.currentRunId).catch(() => {});
	}
}
//#endregion
//#region src/store.ts
function generateSeedConfig() {
	const claudeId = crypto.randomUUID();
	const antigravityId = crypto.randomUUID();
	const copilotId = crypto.randomUUID();
	return {
		version: 1,
		workspaceDir: null,
		maxRounds: 6,
		agents: [
			{
				id: claudeId,
				name: "Claude",
				provider: "claude",
				role: "planner",
				parentId: null,
				autoApprove: false,
				color: "#d97757"
			},
			{
				id: antigravityId,
				name: "Antigravity",
				provider: "antigravity",
				role: "implementer",
				parentId: claudeId,
				model: "gemini-3.1-pro-high",
				autoApprove: true,
				description: "Implementa cambios de código en el workspace usando Antigravity (Gemini)",
				color: "#4f8cff"
			},
			{
				id: copilotId,
				name: "Copilot",
				provider: "copilot",
				role: "implementer",
				parentId: claudeId,
				autoApprove: true,
				description: "Implementa cambios de código usando GitHub Copilot CLI",
				color: "#8b5cf6"
			}
		]
	};
}
var initPromise = null;
var saveTimeout = null;
function debouncedSave() {
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = setTimeout(() => {
		useAppStore.getState().saveConfig();
	}, 300);
}
var useAppStore = create()((set, get) => ({
	loaded: false,
	config: {
		version: 1,
		agents: [],
		workspaceDir: null,
		maxRounds: 6
	},
	binaries: {},
	runtime: {},
	runs: {},
	messages: [],
	activeTaskRunId: null,
	init: () => {
		if (!initPromise) initPromise = runInit();
		return initPromise;
	},
	saveConfig: async () => {
		await getTransport().saveConfig(get().config);
	},
	setWorkspaceDir: (dir, persist = true) => {
		set((state) => ({ config: {
			...state.config,
			workspaceDir: dir
		} }));
		if (persist) debouncedSave();
	},
	setMaxRounds: (n) => {
		set((state) => ({ config: {
			...state.config,
			maxRounds: n
		} }));
		debouncedSave();
	},
	upsertAgent: (agent) => {
		set((state) => {
			const idx = state.config.agents.findIndex((a) => a.id === agent.id);
			const newAgents = [...state.config.agents];
			if (idx >= 0) newAgents[idx] = agent;
			else newAgents.push(agent);
			const newRuntime = { ...state.runtime };
			if (!newRuntime[agent.id]) newRuntime[agent.id] = {
				agentId: agent.id,
				status: "idle",
				queuedInstructions: []
			};
			return {
				config: {
					...state.config,
					agents: newAgents
				},
				runtime: newRuntime
			};
		});
		debouncedSave();
	},
	removeAgent: (agentId) => {
		set((state) => {
			const agent = state.config.agents.find((a) => a.id === agentId);
			const newAgents = state.config.agents.filter((a) => a.id !== agentId).map((a) => {
				if (a.parentId === agentId) return {
					...a,
					parentId: agent?.parentId || null
				};
				return a;
			});
			const newRuntime = { ...state.runtime };
			delete newRuntime[agentId];
			return {
				config: {
					...state.config,
					agents: newAgents
				},
				runtime: newRuntime
			};
		});
		debouncedSave();
	},
	detectBinaries: async () => {
		set({ binaries: await getTransport().detectBinaries() });
	},
	submitPrompt: async (text, targetAgentId) => {
		await submitPrompt(text, targetAgentId);
	},
	instructAgent: async (agentId, text) => {
		await instructAgent(agentId, text);
	},
	stopAgent: async (agentId) => {
		await stopAgent(agentId);
	},
	stopAll: async () => {
		await stopAll();
	},
	resetSession: (agentId) => {
		set((state) => {
			const r = state.runtime[agentId];
			if (!r) return state;
			return { runtime: {
				...state.runtime,
				[agentId]: {
					...r,
					sessionId: void 0
				}
			} };
		});
	},
	clearMessages: () => set({ messages: [] })
}));
async function runInit() {
	const { set, get } = {
		set: useAppStore.setState,
		get: useAppStore.getState
	};
	let config = await getTransport().loadConfig();
	let isSeed = false;
	if (!config) {
		config = generateSeedConfig();
		isSeed = true;
	}
	const runtime = {};
	for (const a of config.agents) runtime[a.id] = {
		agentId: a.id,
		status: "idle",
		queuedInstructions: []
	};
	set({
		config,
		runtime
	});
	if (isSeed) await get().saveConfig();
	await get().detectBinaries();
	await attachListeners();
	set({ loaded: true });
}
function selectChildren(state, agentId) {
	return state.config.agents.filter((a) => a.parentId === agentId);
}
function selectRoots(state) {
	return state.config.agents.filter((a) => a.parentId === null);
}
function selectAgent(state, id) {
	return state.config.agents.find((a) => a.id === id);
}
//#endregion
//#region src/lib/transport-node.ts
var activeRuns = /* @__PURE__ */ new Map();
var killedRuns = /* @__PURE__ */ new Set();
var outputHandlers = /* @__PURE__ */ new Set();
var exitHandlers = /* @__PURE__ */ new Set();
function getConfigPath() {
	const appData = process.env.APPDATA ?? os.homedir();
	return path.join(appData, "com.matias.ais", "config.json");
}
function getVersion(binPath) {
	try {
		const res = spawnSync(binPath, ["--version"], {
			timeout: 5e3,
			encoding: "utf8"
		});
		if (res.status === 0 && res.stdout) return res.stdout.split("\n")[0].trim() || null;
	} catch (e) {}
	return null;
}
function parseSemver(s) {
	const parts = s.split(".");
	const nums = [];
	for (const p of parts) {
		const m = p.match(/^\d+/);
		if (m) nums.push(parseInt(m[0], 10));
		else break;
	}
	return nums.length > 0 ? nums : null;
}
function compareSemver(a, b) {
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const x = a[i] || 0;
		const y = b[i] || 0;
		if (x > y) return 1;
		if (x < y) return -1;
	}
	return 0;
}
function which(name) {
	const isWin = process.platform === "win32";
	const exts = isWin ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";") : [""];
	const pathDirs = (process.env.PATH || "").split(isWin ? ";" : ":");
	for (const dir of pathDirs) for (const ext of exts) {
		const full = path.join(dir, name + ext);
		if (fs.existsSync(full)) try {
			fs.accessSync(full, fs.constants.X_OK);
			return full;
		} catch (e) {}
	}
	return null;
}
function detectClaude() {
	let p = which("claude");
	if (p) return {
		path: p,
		version: getVersion(p)
	};
	const appData = process.env.APPDATA ?? os.homedir();
	const claudeCodeDir = path.join(appData, "Claude", "claude-code");
	let bestPath = null;
	let bestVersion = [
		0,
		0,
		0
	];
	if (fs.existsSync(claudeCodeDir)) {
		const entries = fs.readdirSync(claudeCodeDir, { withFileTypes: true });
		for (const entry of entries) if (entry.isDirectory()) {
			const parsed = parseSemver(entry.name);
			if (parsed) {
				const exePath = path.join(claudeCodeDir, entry.name, "claude.exe");
				if (fs.existsSync(exePath) && compareSemver(parsed, bestVersion) > 0) {
					bestVersion = parsed;
					bestPath = exePath;
				}
			}
		}
	}
	if (bestPath) return {
		path: bestPath,
		version: getVersion(bestPath)
	};
	const localBin = path.join(os.homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude");
	if (fs.existsSync(localBin)) return {
		path: localBin,
		version: getVersion(localBin)
	};
	return null;
}
function detectAgy() {
	let p = which("agy");
	if (p) return {
		path: p,
		version: getVersion(p)
	};
	const agyBin = path.join(os.homedir(), ".gemini", "bin", process.platform === "win32" ? "agy.exe" : "agy");
	if (fs.existsSync(agyBin)) return {
		path: agyBin,
		version: getVersion(agyBin)
	};
	return null;
}
function detectGeneric(name) {
	const p = which(name);
	if (p) return {
		path: p,
		version: getVersion(p)
	};
	return null;
}
/**
* Node refuses to spawn `.cmd`/`.bat` files without a shell, and going through cmd.exe
* mangles prompts with quotes or newlines. npm shims are all shaped the same way
* (`"%_prog%" "%dp0%\node_modules\<pkg>\bin\x.js" %*`), so resolve the script and run it
* with the current Node binary instead.
*/
function resolveProgram(program, args) {
	if (!/\.(cmd|bat)$/i.test(program)) return {
		program,
		args
	};
	try {
		const m = fs.readFileSync(program, "utf-8").match(/"%dp0%\\([^"]+\.(?:m?js|cjs))"/i);
		if (m) {
			const script = path.join(path.dirname(program), m[1]);
			if (fs.existsSync(script)) return {
				program: process.execPath,
				args: [script, ...args]
			};
		}
	} catch {}
	return {
		program: process.env.ComSpec || "cmd.exe",
		args: [
			"/d",
			"/s",
			"/c",
			program,
			...args
		]
	};
}
function killTree(child) {
	if (process.platform === "win32" && child.pid) spawnSync("taskkill", [
		"/PID",
		child.pid.toString(),
		"/T",
		"/F"
	], { windowsHide: true });
	try {
		child.kill(process.platform === "win32" ? "SIGKILL" : "SIGTERM");
	} catch {}
}
/** Kill every active run synchronously (used on process exit). */
function killAllSync() {
	for (const [runId, child] of activeRuns) {
		killedRuns.add(runId);
		killTree(child);
	}
	activeRuns.clear();
}
var nodeTransport = {
	spawnRun: async (opts) => {
		const env = {
			...process.env,
			...opts.env || {},
			NO_COLOR: "1",
			FORCE_COLOR: "0",
			CI: "1"
		};
		const resolved = resolveProgram(opts.program, opts.args);
		const child = spawn(resolved.program, resolved.args, {
			cwd: opts.cwd || process.cwd(),
			env,
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			],
			windowsHide: true
		});
		activeRuns.set(opts.runId, child);
		let exited = false;
		const emitExit = (code) => {
			if (exited) return;
			exited = true;
			activeRuns.delete(opts.runId);
			const killed = killedRuns.has(opts.runId);
			killedRuns.delete(opts.runId);
			const ev = {
				runId: opts.runId,
				code,
				killed
			};
			for (const h of exitHandlers) h(ev);
		};
		child.on("error", (err) => {
			for (const h of outputHandlers) h({
				runId: opts.runId,
				stream: "stderr",
				line: `No se pudo iniciar \`${opts.program}\`: ${err.message}`
			});
			emitExit(null);
		});
		if (child.stdin) child.stdin.on("error", () => {});
		if (opts.stdinText && child.stdin) {
			child.stdin.write(opts.stdinText);
			child.stdin.end();
		}
		if (child.stdout) readline.createInterface({
			input: child.stdout,
			crlfDelay: Infinity
		}).on("line", (line) => {
			const ev = {
				runId: opts.runId,
				stream: "stdout",
				line
			};
			for (const h of outputHandlers) h(ev);
		});
		if (child.stderr) readline.createInterface({
			input: child.stderr,
			crlfDelay: Infinity
		}).on("line", (line) => {
			const ev = {
				runId: opts.runId,
				stream: "stderr",
				line
			};
			for (const h of outputHandlers) h(ev);
		});
		child.on("close", (code) => emitExit(code));
	},
	killRun: async (runId) => {
		const child = activeRuns.get(runId);
		if (!child) return false;
		killedRuns.add(runId);
		killTree(child);
		return true;
	},
	onRunOutput: async (h) => {
		outputHandlers.add(h);
		return () => outputHandlers.delete(h);
	},
	onRunExit: async (h) => {
		exitHandlers.add(h);
		return () => exitHandlers.delete(h);
	},
	loadConfig: async () => {
		const p = getConfigPath();
		if (fs.existsSync(p)) try {
			return JSON.parse(fs.readFileSync(p, "utf-8"));
		} catch (e) {}
		return null;
	},
	saveConfig: async (config) => {
		const p = getConfigPath();
		fs.mkdirSync(path.dirname(p), { recursive: true });
		fs.writeFileSync(p, JSON.stringify(config, null, 2), "utf-8");
	},
	detectBinaries: async () => {
		return {
			claude: detectClaude(),
			antigravity: detectAgy(),
			copilot: detectGeneric("copilot"),
			gemini: detectGeneric("gemini"),
			codex: detectGeneric("codex")
		};
	}
};
//#endregion
//#region src/cli/main.ts
async function main() {
	setTransport(nodeTransport);
	await useAppStore.getState().init();
	const { values, positionals } = parseArgs({
		options: {
			agent: {
				type: "string",
				short: "a"
			},
			workspace: {
				type: "string",
				short: "w"
			},
			json: { type: "boolean" },
			quiet: {
				type: "boolean",
				short: "q"
			},
			"max-rounds": { type: "string" },
			help: {
				type: "boolean",
				short: "h"
			}
		},
		allowPositionals: true
	});
	if (values.help) {
		console.log("Uso: ais [opciones] <prompt>");
		console.log("  -a, --agent <nombre>   Agente a usar");
		console.log("  -w, --workspace <dir>  Directorio de trabajo");
		console.log("  --json                 Salida en JSON por mensaje");
		console.log("  -q, --quiet            Solo imprimir resultado");
		console.log("  --max-rounds <n>       Rondas máximas");
		console.log("  agents                 Listar agentes");
		process.exit(0);
	}
	const store = useAppStore.getState();
	if (positionals[0] === "agents") {
		for (const a of store.config.agents) {
			const parent = a.parentId ? store.config.agents.find((x) => x.id === a.parentId)?.name || a.parentId : "root";
			const bin = store.binaries[a.provider];
			const binInfo = bin && bin.path ? `${bin.path} (${bin.version || "unknown"})` : "No detectado";
			console.log(`- ${a.name} [${a.role}]`);
			console.log(`  Provider: ${a.provider}`);
			console.log(`  Parent: ${parent}`);
			if (a.model) console.log(`  Model: ${a.model}`);
			console.log(`  CLI: ${binInfo}`);
			console.log("");
		}
		process.exit(0);
	}
	const KNOWN = /* @__PURE__ */ new Set(["run", "agents"]);
	const first = positionals[0];
	if (first && !KNOWN.has(first) && positionals.length === 1 && /^[a-z][a-z0-9-]{0,24}$/.test(first)) {
		console.error(`Subcomando desconocido: "${first}". Subcomandos: ${[...KNOWN].join(", ")}. Para mandar un prompt usá: ais run "<texto>"`);
		process.exit(2);
	}
	let prompt = first === "run" ? positionals.slice(1).join(" ") : positionals.join(" ");
	if (!prompt && !process.stdin.isTTY) prompt = fs.readFileSync(0, "utf-8").trim();
	if (!prompt) {
		console.error("Falta el prompt");
		process.exit(2);
	}
	let agentId = "";
	const roots = selectRoots(store);
	if (values.agent) {
		const a = store.config.agents.find((x) => x.name.toLowerCase() === values.agent.toLowerCase());
		if (!a) {
			console.error(`Agente "${values.agent}" no encontrado.`);
			process.exit(2);
		}
		agentId = a.id;
	} else {
		agentId = (roots.find((r) => r.role === "planner") || roots[0])?.id;
		if (!agentId) {
			console.error("No hay agentes configurados.");
			process.exit(2);
		}
	}
	if (values.workspace) useAppStore.getState().setWorkspaceDir(path.resolve(values.workspace), false);
	else useAppStore.getState().setWorkspaceDir(process.cwd(), false);
	if (values["max-rounds"]) useAppStore.getState().setMaxRounds(parseInt(values["max-rounds"], 10));
	const printedLengths = /* @__PURE__ */ new Map();
	useAppStore.subscribe((state, prevState) => {
		if (state.messages.length > prevState.messages.length || state.messages !== prevState.messages) {
			for (const msg of state.messages) if (!prevState.messages.find((m) => m.id === msg.id) || msg.kind === "text") {
				const prevLen = printedLengths.get(msg.id) || 0;
				if (msg.text.length > prevLen) {
					const delta = msg.text.substring(prevLen);
					printedLengths.set(msg.id, msg.text.length);
					if (values.json) console.log(JSON.stringify(msg));
					else if (!values.quiet || msg.kind === "result" && msg.toAgentId === "user") {
						if (msg.kind !== "text" || prevLen === 0) {
							const date = new Date(msg.ts).toLocaleTimeString("en-GB", { hour12: false });
							const fromName = msg.fromAgentId === "user" ? "user" : msg.fromAgentId === "system" ? "system" : store.config.agents.find((a) => a.id === msg.fromAgentId)?.name || msg.fromAgentId;
							const toName = msg.toAgentId === "user" ? "user" : msg.toAgentId ? store.config.agents.find((a) => a.id === msg.toAgentId)?.name || msg.toAgentId : "";
							let colorPrefix = "\x1B[0m";
							if (msg.kind === "error" || msg.kind === "stderr") colorPrefix = "\x1B[31m";
							else if (msg.kind === "delegation") colorPrefix = "\x1B[33m";
							else if (msg.kind === "tool") colorPrefix = "\x1B[90m";
							else if (msg.kind === "result") colorPrefix = "\x1B[32m";
							const header = `${date}  ${store.config.agents.find((a) => a.id === msg.fromAgentId)?.color ? `\x1b[36m` : `\x1b[34m`}${fromName}\x1b[0m ${toName ? `→ ${toName}` : ""}  [${msg.kind}]`;
							if (msg.kind === "text") process.stdout.write(`\n${header}\n${colorPrefix}${delta}\x1b[0m`);
							else console.log(`${header}  ${colorPrefix}${msg.text}\x1b[0m`);
						} else process.stdout.write(delta);
					}
				}
			}
		}
		if (prevState.activeTaskRunId !== null && state.activeTaskRunId === null) {
			if (!values.json) process.stdout.write("\n");
			const isError = state.messages.find((m) => m.kind === "error" && m.text.includes("No se encontró el CLI")) || state.runs[prevState.activeTaskRunId]?.status === "error";
			process.exit(isError ? 1 : 0);
		}
	});
	process.on("SIGINT", () => {
		useAppStore.getState().stopAll();
		setTimeout(() => process.exit(130), 3e3);
	});
	process.stdout.on("error", (err) => {
		if (err.code === "EPIPE") {
			killAllSync();
			process.exit(0);
		}
	});
	process.on("exit", () => killAllSync());
	await useAppStore.getState().submitPrompt(prompt, agentId);
}
main().catch((e) => {
	console.error(e);
	process.exit(2);
});
//#endregion
export {};

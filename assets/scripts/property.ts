import { __private, _decorator, Canvas, Component, tween, UIOpacity } from "cc";

const { property: _property } = _decorator;

type LegacyPropertyDecorator = __private._cocos_core_data_decorators_utils__LegacyPropertyDecorator;

export function property(options?: __private._cocos_core_data_decorators_property__IPropertyOptions): LegacyPropertyDecorator;
export function property(type: __private._cocos_core_data_decorators_property__PropertyType): LegacyPropertyDecorator;
export function property(...args: Parameters<LegacyPropertyDecorator>): void;
export function property(target?: any, propertyKey?: any, descriptorOrInitializer?: any): LegacyPropertyDecorator | undefined {
  if (target === undefined) {
    // @property() => LegacyPropertyDecorator
    return _property({
      visible: true,
    });
  } else if (typeof propertyKey === "undefined") {
    // @property(options) => LegacyPropertyDescriptor
    // @property(type) => LegacyPropertyDescriptor
    // options = target;
    if (typeof target === "object") {
      if (Array.isArray(target)) {
        return _property({ type: target, visible: true });
      }

      if (target.visible === undefined) target.visible = true;
      return _property(target);
    }

    return _property({ type: target, visible: true });
  } else {
    // @property
    return _property({ visible: true })(target, propertyKey, descriptorOrInitializer)!;
  }
} 
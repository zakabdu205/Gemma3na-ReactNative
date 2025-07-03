#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(GemmaBridge, NSObject)

RCT_EXTERN_METHOD(generateResponse:(NSString *)prompt
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

@end 
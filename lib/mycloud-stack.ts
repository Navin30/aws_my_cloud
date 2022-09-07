import * as cdk from '@aws-cdk/core';
import * as lambda from "@aws-cdk/aws-lambda";
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as s3 from '@aws-cdk/aws-s3';
import * as iam from '@aws-cdk/aws-iam';
import * as apigw from "@aws-cdk/aws-apigateway";
import * as path from "path"
import { LogGroup } from "@aws-cdk/aws-logs";
import * as route53 from "@aws-cdk/aws-route53";
import * as alias from "@aws-cdk/aws-route53-targets";
import * as wafv2 from '@aws-cdk/aws-wafv2';

export class MycloudStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const webserverRole = new iam.Role(this, 'webserver-role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });
    const apiDefaultHandler =  new lambda.Function(
      this,
      "apiDefaultHandler",
      {
        runtime: lambda.Runtime.PYTHON_3_9,
        role:webserverRole,
        code: lambda.Code.fromAsset(path.join(__dirname,'../hello/')),
        handler: "default.handler",
        memorySize: 1024
        
      }
    );
    const apiHelloGetHandler =  new lambda.Function(
      this,
      "apiHelloGetHandler",
      {
        runtime: lambda.Runtime.PYTHON_3_9,
        role:webserverRole,
        code: lambda.Code.fromAsset(path.join(__dirname,'../hello/')),
        handler: "hello.handler",
        memorySize: 1024
        
      }
    );
    const apiWorldGetHandler =  new lambda.Function(
      this,
      "apiWorldGetHandler",
      {
        runtime: lambda.Runtime.PYTHON_3_9,
        role:webserverRole,
        code: lambda.Code.fromAsset(path.join(__dirname,'../hello/')),
        handler: "world.handler",
        memorySize: 1024
        
      }
    );
    const nvApiLog = new LogGroup(this, "nvApiLog");

    const apiGateway = new apigw.LambdaRestApi(this, "apiGateway", {
      handler: apiDefaultHandler,
      endpointConfiguration: {
        types: [apigw.EndpointType.REGIONAL]
      },
      defaultMethodOptions: {
        authorizationType: apigw.AuthorizationType.NONE
      },
      proxy: false,
      deployOptions: {
        accessLogDestination: new apigw.LogGroupLogDestination(nvApiLog),
        accessLogFormat: apigw.AccessLogFormat.jsonWithStandardFields(),
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        metricsEnabled: true,
      },
    })
    
   
    apiGateway.root.addMethod('ANY');

    const apiHelloRoute = apiGateway.root.addResource("hello")
    // GET
    apiHelloRoute.addMethod(
      "GET",
        new apigw.LambdaIntegration(apiHelloGetHandler)
    );
    apiHelloRoute.addMethod(
      "POST",
      new apigw.LambdaIntegration(apiHelloGetHandler)
    )

    
    // /api/world
    const apiWorldRoute = apiGateway.root.addResource("world")
    // GET
    apiWorldRoute.addMethod(
      "GET",
      new apigw.LambdaIntegration(apiWorldGetHandler)
    );
    apiWorldRoute.addMethod(
      "POST",
      new apigw.LambdaIntegration(apiWorldGetHandler)
    )
    const ipSet = new wafv2.CfnIPSet(this, 'IPSet1', {
      addresses: ['103.16.13.205/32'],
      scope: 'CLOUDFRONT',
      ipAddressVersion: 'IPV4'
    });
  
    // Create WAFv2 Rule IP Whitelisting
    const rules: wafv2.CfnWebACL.RuleProperty[] = [];
    rules.push(
      {
        name: 'IPWhitelistRule1', // Note the PascalCase for all the properties
        priority: 1,
        action: {
          allow: {}
        },
        statement: {
          ipSetReferenceStatement: {
            arn: ipSet.attrArn
          }
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'ipWhitelist1',
          sampledRequestsEnabled: false,
        }
      }
    );
  
    const webACL = new wafv2.CfnWebACL(this, 'WebACL', {
      defaultAction: {
        block: {},
      },
      scope: 'CLOUDFRONT',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'waf1',
        sampledRequestsEnabled: false,
      },
    });
    webACL.addPropertyOverride("rules", rules);
  
    const siteDomain = "navintypescriptdeveops.com"
  const distribution = new cloudfront.CloudFrontWebDistribution(this, "webDistribution", {
    aliasConfiguration: {
      acmCertRef: "arn:aws:acm:us-east-1:814445629751:certificate/8f3a96b3-470e-4775-a89c-8f6d814bf3bb",
      securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2018,
      names: [siteDomain],
      
    },
    
    loggingConfig: {
      bucket: new s3.Bucket(this, 'LogBucket', {
      bucketName: 'nvlambdalogbucket',
        lifecycleRules: [
            {
              enabled: true,
              expiration: cdk.Duration.days(30),
            },
          ],
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          autoDeleteObjects: true,
        }),
        includeCookies: true,
      },
      
    originConfigs: [
      {
        
          customOriginSource: {
            domainName: `${apiGateway.restApiId}.execute-api.${this.region}.${this.urlSuffix}`,
          },
          originPath: `/${apiGateway.deploymentStage.stageName}`,
                
        behaviors: [
          {
            isDefaultBehavior: true,
            allowedMethods: cloudfront.CloudFrontAllowedMethods.ALL,
            
          },
          
        ],
      },
      {
      behaviors: [
        {
          
          allowedMethods: cloudfront.CloudFrontAllowedMethods.ALL,
          pathPattern: "/hello",
          
        },
        
      ],
      
      customOriginSource: {
        domainName: `${apiGateway.restApiId}.execute-api.${this.region}.${this.urlSuffix}`,
      },
      originPath: `/${apiGateway.deploymentStage.stageName}`,
      
    },
    {
      behaviors: [
        {
          
          allowedMethods: cloudfront.CloudFrontAllowedMethods.ALL,
          pathPattern: "/world",
          
        },
        
      ],
      customOriginSource: {
        domainName: `${apiGateway.restApiId}.execute-api.${this.region}.${this.urlSuffix}`,
      },
      originPath: `/${apiGateway.deploymentStage.stageName}`,
    },
    
    
],
errorConfigurations:
[
  {
    errorCode: 404,
    errorCachingMinTtl: 0,
    "responseCode": 200,
    "responsePagePath": "//cloudfronterrorbucket.s3.sa-east-1.amazonaws.com/error.html"
  },
],

    defaultRootObject: "",
    webACLId: webACL.attrArn,
    comment: "nv lambda Api" 
    
  });
  const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'ZenithWebFoundryZone', {
    hostedZoneId: 'Z0918647YP9QBSN696HQ',
    zoneName: 'navintypescriptdeveops.com.' // your zone name here
  });
  new route53.ARecord(this, 'AliasRecord', {
    zone,
    target: route53.RecordTarget.fromAlias(new alias.CloudFrontTarget(distribution)),
    
  });
 
 
}
}
   
  
